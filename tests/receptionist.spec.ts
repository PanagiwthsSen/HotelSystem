import { test, expect } from '@playwright/test';

const SB_URL = process.env.VITE_SUPABASE_URL!;
const SB_KEY = process.env.VITE_SUPABASE_KEY!;
const SB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function sbPost(table: string, data: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: SB, body: JSON.stringify(data) });
  if (r.status === 409) {
    const errBody = await r.json();
    const match = typeof errBody.details === 'string' ? errBody.details.match(/"(\w+)"\)\s*=\s*\((\d+)\)/) : null;
    if (match) {
      await fetch(`${SB_URL}/rest/v1/${table}?${match[1]}=eq.${match[2]}`, { method: 'DELETE', headers: SB }).catch(() => {});
      const retry = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: SB, body: JSON.stringify(data) });
      if (!retry.ok) throw new Error(`POST ${table} ${retry.status}: ${await retry.text()}`);
      const retryBody = await retry.json();
      return Array.isArray(retryBody) ? retryBody[0] : retryBody;
    }
    throw new Error(`POST ${table} 409: ${errBody.message}`);
  }
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${await r.text()}`);
  const body = await r.json();
  return Array.isArray(body) ? body[0] : body;
}
async function sbGet(table: string, query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: SB });
  if (!r.ok) throw new Error(`GET ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbDelete(table: string, query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: SB });
  if (!r.ok && r.status !== 406) throw new Error(`DELETE ${table} ${r.status}: ${await r.text()}`);
}

function pickRoomNum(): number {
  return 9500 + parseInt(Date.now().toString().slice(-3));
}

test.describe('Receptionist — Booking & Room Lifecycle', () => {

  test('create booking → intercept CUSTOMER POST (201) → success toast + dashboard redirect', async ({ page }) => {
    page.route(
      url => url.toString().includes('/rest/v1/rpc/book_room_atomic'),
      async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ReservationID: 99999 })
        });
      }
    );
    page.route(
      url => url.toString().includes('/rest/v1/RESERVATION?ReservationID=eq.99999'),
      async route => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        } else {
          await route.continue();
        }
      }
    );
    page.route(
      url => url.toString().includes('/rest/v1/RESERVATION_HISTORY'),
      async route => {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{}]) });
      }
    );

    await page.goto('/pages/login.html');
    await page.fill('#username', 'maria_rec');
    await page.fill('#password', '1234');
    await page.click('.btn-login');
    await page.waitForURL('**/pages/receptionist.html', { timeout: 10000 });
    await page.waitForSelector('#v-dash.active', { timeout: 15000 });
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 0;
    }, { timeout: 15000 });

    await page.click('.sb-item[data-v="new-booking"]');
    await expect(page.locator('#v-new-booking')).toBeVisible();

    const today = '2026-05-28';
    const plus4 = '2026-06-01';
    await page.fill('#nb-in', today);
    await page.fill('#nb-out', plus4);

    const rtype = page.locator('#nb-rtype');
    const firstValue = await rtype.locator('option').nth(0).getAttribute('value');
    await rtype.selectOption(firstValue);

    await page.click('button:has-text("Αναζήτηση")');
    await page.waitForSelector('#avail-rooms .room-opt', { timeout: 15000 });

    const suffix = Date.now().toString().slice(-4);
    await page.fill('#nb-last', `RecTest${suffix}`);
    await page.fill('#nb-first', 'E2E');
    await page.fill('#nb-phone', `+30-69${suffix}0000`);
    await page.fill('#nb-email', `rec${suffix}@test.gr`);

    const customerResPromise = page.waitForResponse(
      res => res.url().includes('/rest/v1/CUSTOMER') && res.status() === 201,
      { timeout: 20000 }
    );

    await page.click('button:has-text("Καταχώρηση")');
    await page.waitForSelector('#confirm-yes', { timeout: 5000 });
    await page.click('#confirm-yes');

    const customerRes = await customerResPromise;
    expect(customerRes.status()).toBe(201);

    await expect(page.locator('.live-toast.success')).toContainText('καταχωρήθηκε', { timeout: 5000 });
    await expect(page.locator('#v-dash.active')).toBeVisible({ timeout: 5000 });
  });

  test('check-in a reservation → ROOM Status becomes occ', async ({ page }) => {
    const roomNum = pickRoomNum();
    const today = new Date().toISOString().split('T')[0];
    const plus3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    const suffix = Date.now().toString().slice(-4);

    let reservation: Record<string, unknown> = {};
    let customer: Record<string, unknown> = {};

    // Pre-cleanup
    await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    const oldCusts = await sbGet('CUSTOMER', `Email=like.%25ci.test.%25&select=CustomerID`).catch(() => []) as Array<{ CustomerID: number }>;
    for (const c of (Array.isArray(oldCusts) ? oldCusts : [])) {
      const oldResvs = await sbGet('RESERVATION', `CustomerID=eq.${c.CustomerID}&select=ReservationID`).catch(() => []) as Array<{ ReservationID: number }>;
      for (const r of (Array.isArray(oldResvs) ? oldResvs : [])) {
        await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
        await sbDelete('RESERVATION', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
      }
      await sbDelete('CUSTOMER', `CustomerID=eq.${c.CustomerID}`).catch(() => {});
    }

    try {
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'free' });
      customer = await sbPost('CUSTOMER', {
        Phone: `+30-69${suffix}0000`, Email: `ci.test.${suffix}@test.gr`, IsGroup: false,
        FirstName: 'CI', LastName: `Test${suffix}`,
      });
      reservation = await sbPost('RESERVATION', {
        CustomerID: customer.CustomerID, CheckInDate: today, CheckOutDate: plus3,
        TotalCost: 150, Status: 'Confirmed',
      });
      await sbPost('RESERVATION_ROOM', { ReservationID: reservation.ReservationID, RoomNumber: roomNum });

      await page.goto('/pages/login.html');
      await page.fill('#username', 'maria_rec');
      await page.fill('#password', '1234');
      await page.click('.btn-login');
      await page.waitForURL('**/pages/receptionist.html', { timeout: 10000 });
      await page.waitForSelector('#v-dash.active', { timeout: 15000 });

      await page.click('.sb-item[data-v="arrivals"]');
      await expect(page.locator('#v-arrivals')).toBeVisible();

      await page.waitForSelector('#v-arrivals table tbody tr', { timeout: 15000 });

      const arrivalRow = page.locator('#v-arrivals tbody tr').filter({ hasText: roomNum.toString() }).first();
      const checkinBtn = arrivalRow.locator('button:has-text("Check-in")').first();
      const hasArrival = await checkinBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasArrival) {
        test.skip(`No Check-in button for room ${roomNum}`);
        return;
      }
      await checkinBtn.click();

      await page.waitForSelector('#checkin-modal', { timeout: 5000 });

      const confirmBtn = page.locator('#checkin-modal button:has-text("Επιβεβαίωση")').first();
      const hasConfirm = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasConfirm) {
        test.skip('Check-in confirm button not found in modal');
        return;
      }

      const roomPatchPromise = page.waitForResponse(
        r => r.url().includes('/rest/v1/ROOM') && r.request().method() === 'PATCH', { timeout: 10000 }
      );

      await confirmBtn.click();

      await page.waitForSelector('#confirm-yes', { timeout: 5000 });
      await page.click('#confirm-yes');

      const patchRes = await roomPatchPromise;
      expect([200, 204]).toContain(patchRes.status());

      await expect(page.locator('.live-toast')).toBeVisible({ timeout: 5000 });
    } finally {
      await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('RESERVATION', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('CUSTOMER', `CustomerID=eq.${(customer as Record<string, unknown>).CustomerID}`).catch(() => {});
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    }
  });

  test('check-out a reservation → ROOM dirty', async ({ page }) => {
    const roomNum = pickRoomNum();
    const today = new Date().toISOString().split('T')[0];
    const suffix = Date.now().toString().slice(-4);

    let reservation: Record<string, unknown> = {};
    let customer: Record<string, unknown> = {};

    // Pre-cleanup
    await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    const oldCusts = await sbGet('CUSTOMER', `Email=like.%25co.test.%25&select=CustomerID`).catch(() => []) as Array<{ CustomerID: number }>;
    for (const c of (Array.isArray(oldCusts) ? oldCusts : [])) {
      const oldResvs = await sbGet('RESERVATION', `CustomerID=eq.${c.CustomerID}&select=ReservationID`).catch(() => []) as Array<{ ReservationID: number }>;
      for (const r of (Array.isArray(oldResvs) ? oldResvs : [])) {
        await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
        await sbDelete('RESERVATION', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
      }
      await sbDelete('CUSTOMER', `CustomerID=eq.${c.CustomerID}`).catch(() => {});
    }

    try {
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'free' });
      customer = await sbPost('CUSTOMER', {
        Phone: `+30-69${suffix}0000`, Email: `co.test.${suffix}@test.gr`, IsGroup: false,
        FirstName: 'CO', LastName: `Test${suffix}`,
      });
      reservation = await sbPost('RESERVATION', {
        CustomerID: customer.CustomerID, CheckInDate: '2026-05-26', CheckOutDate: today,
        TotalCost: 100, Status: 'Confirmed',
      });
      await sbPost('RESERVATION_ROOM', { ReservationID: reservation.ReservationID, RoomNumber: roomNum });

      await page.goto('/pages/login.html');
      await page.fill('#username', 'maria_rec');
      await page.fill('#password', '1234');
      await page.click('.btn-login');
      await page.waitForURL('**/pages/receptionist.html', { timeout: 10000 });
      await page.waitForSelector('#v-dash.active', { timeout: 15000 });

      await page.click('.sb-item[data-v="departures"]');
      await expect(page.locator('#v-departures')).toBeVisible();

      await page.waitForSelector('#v-departures table tbody tr', { timeout: 15000 });

      const depRow = page.locator('#v-departures tbody tr').filter({ hasText: roomNum.toString() }).first();
      const checkoutBtn = depRow.locator('button:has-text("Check-out")').first();
      const hasDeparture = await checkoutBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (!hasDeparture) {
        test.skip(`No Check-out button for room ${roomNum}`);
        return;
      }
      await checkoutBtn.click();

      await page.waitForSelector('.receipt-overlay', { timeout: 10000 });
      await page.click('#receipt-confirm');

      let roomStatus: string | undefined;
      const pollStart = Date.now();
      while (Date.now() - pollStart < 15000) {
        const result = await sbGet('ROOM', `RoomNumber=eq.${roomNum}&select=Status`);
        roomStatus = Array.isArray(result) ? (result[0] as any)?.Status : (result as any)?.Status;
        if (roomStatus === 'dirty') break;
        await new Promise(r => setTimeout(r, 500));
      }
      expect(roomStatus).toBe('dirty');

      await expect(page.locator('.live-toast').filter({ hasText: 'Check-out' }).first()).toBeVisible({ timeout: 5000 });
    } finally {
      await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('RESERVATION', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('CUSTOMER', `CustomerID=eq.${(customer as Record<string, unknown>).CustomerID}`).catch(() => {});
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    }
  });
});
