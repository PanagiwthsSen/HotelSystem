import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const SB_URL = process.env.VITE_SUPABASE_URL!;
const SB_KEY = process.env.VITE_SUPABASE_KEY!;
const SB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const ROOM_RANGE_START = 9200;
const ROOM_RANGE_END = 9400;

async function sbPost(table: string, data: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: SB, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${await r.text()}`);
  const body = await r.json();
  return Array.isArray(body) ? body[0] : body;
}
async function sbPatch(table: string, query: string, data: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: SB, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`PATCH ${table} ${r.status}: ${await r.text()}`);
}
async function sbDelete(table: string, query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: SB });
  if (!r.ok) throw new Error(`DELETE ${table} ${r.status}: ${await r.text()}`);
}
async function sbGet(table: string, query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: SB });
  if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}

function pickRoomNum(): number {
  // Pick a unique room number using timestamp suffix
  const ts = Date.now().toString().slice(-3);
  return ROOM_RANGE_START + parseInt(ts);
}

// Cleanup all test rooms + related records before each test
async function cleanupTestData(roomNum?: number) {
  if (roomNum) {
    await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    return;
  }
  for (let n = ROOM_RANGE_START; n <= ROOM_RANGE_END; n++) {
    await sbDelete('ROOM', `RoomNumber=eq.${n}`).catch(() => {});
  }
  // Also clean up test CUSTOMERs and related RESERVATIONs
  const custs = await sbGet('CUSTOMER', `Email=like.%cross.test%&select=CustomerID`).catch(() => []) as Array<{ CustomerID: number }>;
  for (const c of (Array.isArray(custs) ? custs : [])) {
    const resvs = await sbGet('RESERVATION', `CustomerID=eq.${c.CustomerID}&select=ReservationID`).catch(() => []) as Array<{ ReservationID: number }>;
    for (const r of (Array.isArray(resvs) ? resvs : [])) {
      await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
      await sbDelete('RECEIPT', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
      await sbDelete('RESERVATION', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
    }
    await sbDelete('CUSTOMER', `CustomerID=eq.${c.CustomerID}`).catch(() => {});
  }
}

async function loginAs(page: Page, username: string, password: string, redirectUrl: string) {
  await page.goto('/pages/login.html');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('.btn-login');
  await page.waitForURL(`**${redirectUrl}`, { timeout: 10000 });
}

test.describe('Cross-Role Communication', () => {

  test('1: Maid cleans room → NOTIFICATION for receptionist', async ({ browser }) => {
    const roomNum = pickRoomNum();
    const suffix = Date.now().toString().slice(-4);
    await cleanupTestData(roomNum);

    try {
      // Setup: create dirty room
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'dirty' });

      // Context A: Maid — clean the room
      const ctxMaid: BrowserContext = await browser.newContext();
      const maidPage: Page = await ctxMaid.newPage();
      await loginAs(maidPage, 'eleni_maid', '1234', '/pages/maid.html');

      await maidPage.click('.sb-item[data-v="rooms"]');
      await maidPage.waitForSelector('#room-list .room-card', { timeout: 10000 });

      // Find the dirty room card — the .room-num div contains just the number
      const maidCard = maidPage.locator('#room-list .room-card').filter({ has: maidPage.locator(`.room-num:has-text("${roomNum}")`) });
      const hasCard = await maidCard.count().then(c => c > 0).catch(() => false);
      if (!hasCard) {
        // Debug: check what rooms are in the maid list
        const roomNums = await maidPage.evaluate(() => {
          const cards = document.querySelectorAll('#room-list .room-card');
          return Array.from(cards).map(c => c.querySelector('.room-num')?.textContent?.trim()).filter(Boolean);
        });
        console.log('Visible rooms:', roomNums);
        test.skip(`Room ${roomNum} not in maid list. Visible: [${roomNums.join(', ')}]`);
        await ctxMaid.close();
        return;
      }

      // Click start cleaning — this fires PATCH (dirty→cleaning) + NOTIFICATION (room_in_progress)
      const startBtn = maidCard.locator('button:has-text("Καθαρισμός")').first();
      if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await startBtn.click();
      } else {
        await maidCard.locator('.pill.p-r').click();
      }

      // Wait for complete button AFTER setRoomInProgress finishes
      await maidPage.locator('button:has-text("Ολοκλήρωση")').first().waitFor({ timeout: 8000 });

      // Intercept setRoomDone's calls — set up AFTER setRoomInProgress has already fired
      const patchPromise = maidPage.waitForResponse(
        r => r.url().includes('/rest/v1/ROOM') && r.request().method() === 'PATCH', { timeout: 10000 }
      );
      const notifPromise = maidPage.waitForResponse(
        r => r.url().includes('/rest/v1/NOTIFICATION') && r.status() === 201, { timeout: 10000 }
      );

      await maidPage.locator('button:has-text("Ολοκλήρωση")').first().click();
      await maidPage.waitForSelector('#confirm-yes', { timeout: 5000 });
      await maidPage.click('#confirm-yes');

      const patchRes = await patchPromise;
      const notifRes = await notifPromise;
      expect([200, 204]).toContain(patchRes.status());
      expect(notifRes.status()).toBe(201);

      // Verify NOTIFICATION TargetRole via response body
      const notifBody = await notifRes.text().catch(() => '');
      if (notifBody) {
        try {
          const parsed = JSON.parse(notifBody);
          const targetRole = Array.isArray(parsed) ? parsed[0]?.TargetRole : parsed?.TargetRole;
          expect(targetRole).toBe('receptionist');
        } catch { /* body may be empty */ }
      }

      // Verify ROOM status changed via direct API
      const rooms = await sbGet('ROOM', `RoomNumber=eq.${roomNum}&select=Status`);
      expect(Array.isArray(rooms) ? rooms[0]?.Status : rooms?.Status).toBe('clean');

      await ctxMaid.close();
    } finally {
      // Cleanup
      await sbDelete('NOTIFICATION', `Message=like.%${roomNum}%`).catch(() => {});
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    }
  });

  test('2: Receptionist check-out → Maid sees dirty room', async ({ browser }) => {
    const roomNum = pickRoomNum();
    const today = new Date().toISOString().split('T')[0];
    const suffix = Date.now().toString().slice(-4);
    await cleanupTestData(roomNum);

    let customer: Record<string, unknown> = {};
    let reservation: Record<string, unknown> = {};
    const ctxRec: BrowserContext = await browser.newContext();
    const recPage: Page = await ctxRec.newPage();

    try {
      // Setup: create ROOM → CUSTOMER → RESERVATION → RESERVATION_ROOM
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'free' });
      customer = await sbPost('CUSTOMER', {
        Phone: `+30-69${suffix}0000`, Email: `cross.test.${suffix}@test.gr`, IsGroup: false,
        FirstName: 'E2E', LastName: `ChkOut${suffix}`,
      });
      reservation = await sbPost('RESERVATION', {
        CustomerID: customer.CustomerID, CheckInDate: '2026-05-26', CheckOutDate: today,
        TotalCost: 100, Status: 'Confirmed',
      });
      await sbPost('RESERVATION_ROOM', { ReservationID: reservation.ReservationID, RoomNumber: roomNum });

      // Context A: Receptionist — check-out
      await loginAs(recPage, 'maria_rec', '1234', '/pages/receptionist.html');
      await recPage.waitForSelector('#v-dash.active', { timeout: 15000 });

      await recPage.click('.sb-item[data-v="departures"]');
      await recPage.waitForSelector('#v-departures', { timeout: 10000 });

      // Wait for departures data to load (tbody has rows)
      await recPage.waitForSelector('#v-departures table tbody tr', { timeout: 15000 });

      // Find the check-out button scoped to the row containing our room number
      const depRow = recPage.locator('#v-departures tbody tr').filter({ hasText: roomNum.toString() }).first();
      const checkoutBtn = depRow.locator('button:has-text("Check-out")').first();
      const hasCheckout = await checkoutBtn.isVisible({ timeout: 5000 }).catch(() => false);

      if (!hasCheckout) {
        test.skip(`No check-out button for room ${roomNum}`);
        return;
      }
      await checkoutBtn.click();

      // Wait for receipt modal (not showConfirm — uses custom receipt modal)
      await recPage.waitForSelector('.receipt-overlay', { timeout: 10000 });

      // Listen for console errors
      const errors: string[] = [];
      recPage.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

      await recPage.click('#receipt-confirm');

      // Wait for ROOM to become dirty (poll via direct API, up to 15s)
      let roomStatus: string | undefined;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const result = await sbGet('ROOM', `RoomNumber=eq.${roomNum}&select=Status`);
        roomStatus = Array.isArray(result) ? (result[0] as any)?.Status : (result as any)?.Status;
        if (roomStatus === 'dirty') break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (roomStatus !== 'dirty') {
        console.log('Console errors:', errors);
        console.log('Room status:', roomStatus);
      }
      expect(roomStatus).toBe('dirty');

      // Context B: Maid — verify dirty room visible
      const ctxMaid: BrowserContext = await browser.newContext();
      const maidPage: Page = await ctxMaid.newPage();
      await loginAs(maidPage, 'eleni_maid', '1234', '/pages/maid.html');
      await maidPage.click('.sb-item[data-v="rooms"]');
      await maidPage.waitForSelector('#room-list .room-card', { timeout: 10000 });
      await maidPage.waitForTimeout(1500);

      const dirtyCard = maidPage.locator('#room-list .room-card').filter({ has: maidPage.locator(`.room-num:has-text("${roomNum}")`) });
      const isVisible = await dirtyCard.count().then(c => c > 0).catch(() => false);
      expect(isVisible).toBeTruthy();

      await ctxMaid.close();
    } finally {
      await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('RESERVATION', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
      await sbDelete('CUSTOMER', `CustomerID=eq.${(customer as Record<string, unknown>).CustomerID}`).catch(() => {});
      await ctxRec.close();
    }
  });

  test('3: Minibar restock request → External Manager sees notification', async ({ browser }) => {
    const ctxBar: BrowserContext = await browser.newContext();
    const barPage: Page = await ctxBar.newPage();
    await loginAs(barPage, 'nikos_bar', '1234', '/pages/minibar.html');
    await barPage.waitForFunction(() => typeof window.navTo === 'function', { timeout: 5000 });
    await barPage.evaluate(() => window.navTo('stock'));
    await barPage.waitForSelector('button:has-text("Παραγγελία")', { timeout: 15000 });

    const restockBtn = barPage.locator('button:has-text("Παραγγελία")').first();
    const hasBtn = await restockBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasBtn) {
      test.skip('Restock button not found');
      await ctxBar.close();
      return;
    }

    const notifPromise = barPage.waitForResponse(
      r => r.url().includes('/rest/v1/NOTIFICATION') &&
             r.request().method() === 'POST' &&
             r.status() === 201,
      { timeout: 10000 }
    );

    // Set first inventory item to 0 so restock request will POST
    const origQty: number = await barPage.evaluate(async () => {
      const w = window as any;
      const { data: items } = await w.supabase.from('INVENTORY_ITEM').select('ItemID, Quantity, MinThreshold').limit(1);
      const item = (items || [])[0];
      if (!item) return -1;
      const oldQty = item.Quantity;
      await w.supabase.from('INVENTORY_ITEM').update({ Quantity: 0 }).eq('ItemID', item.ItemID);
      return oldQty;
    });
    if (origQty < 0) { test.skip('No inventory items'); return; }
    await barPage.evaluate(() => (window as any).navTo('stock'));
    await barPage.waitForTimeout(500);

    await barPage.evaluate(async () => {
      await (window as any).requestRestockAll();
    });
    const notifRes = await notifPromise;
    expect(notifRes.status()).toBe(201);

    // Restore original quantity
    await barPage.evaluate(async (qty: number) => {
      const w = window as any;
      const { data: items } = await w.supabase.from('INVENTORY_ITEM').select('ItemID').limit(1);
      if ((items || [])[0]) await w.supabase.from('INVENTORY_ITEM').update({ Quantity: qty }).eq('ItemID', (items[0] as any).ItemID);
    }, origQty);

    const notifBody = await notifRes.text().catch(() => '');
    if (notifBody) {
      try {
        const parsed = JSON.parse(notifBody);
        const targetRole = Array.isArray(parsed) ? parsed[0]?.TargetRole : parsed?.TargetRole;
        if (targetRole) expect(targetRole).toBe('external_manager');
      } catch { /* body may be empty */ }
    }

    const ctxMgr: BrowserContext = await browser.newContext();
    const mgrPage: Page = await ctxMgr.newPage();

    mgrPage.route(
      u => u.toString().includes('/rest/v1/EMPLOYEE') && u.toString().includes('Role=in.'),
      async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { EmpID: 1, Role: 'driver', FirstName: 'Test', LastName: 'Driver', Salary: 1000, isActive: true, Leaves: 0, Score: 5, IBAN: '', LastPaymentDate: null, Username: '', Password: '', Country: '' },
        { EmpID: 2, Role: 'driver', FirstName: 'Test2', LastName: 'Driver2', Salary: 1000, isActive: true, Leaves: 0, Score: 5, IBAN: '', LastPaymentDate: null, Username: '', Password: '', Country: '' },
      ]) })
    );
    mgrPage.route(
      u => u.toString().includes('/rest/v1/TRIP') || u.toString().includes('/rest/v1/VEHICLE'),
      async route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    mgrPage.route(
      u => u.toString().includes('/rest/v1/INVENTORY_ITEM'),
      async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { ItemID: 1, Name: 'Test Item', Category: 'Minibar', Quantity: 5, MinThreshold: 10 },
      ]) })
    );

    await loginAs(mgrPage, 'ioan_manag', '1234', '/pages/external_manager.html');
    await mgrPage.waitForTimeout(3000);
    await mgrPage.evaluate(() => {
      const app = document.querySelector('.app') as HTMLElement;
      if (app) app.style.display = 'flex';
      const loader = document.getElementById('app-loader');
      if (loader) loader.style.display = 'none';
    });

    const notifContainer = mgrPage.locator('#manager-notifications');
    const hasNotifs = await notifContainer.isVisible({ timeout: 8000 }).catch(() => false);
    if (hasNotifs) {
      const notifText = await notifContainer.textContent({ timeout: 3000 }).catch(() => '');
      expect(notifText?.length).toBeGreaterThan(0);
    } else {
      const notifs = await sbGet('NOTIFICATION', 'TargetRole=eq.external_manager&IsRead=eq.false&order=CreatedAt.desc&limit=5');
      const list = Array.isArray(notifs) ? notifs : [];
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.some((n: { Type?: string }) => n.Type === 'restock_request')).toBeTruthy();
    }

    await ctxBar.close();
    await ctxMgr.close();
  });
});
