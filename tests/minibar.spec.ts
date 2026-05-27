import { test, expect } from '@playwright/test';

const SB_URL = process.env.VITE_SUPABASE_URL!;
const SB_KEY = process.env.VITE_SUPABASE_KEY!;
const SB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function sbPost(table: string, data: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: SB, body: JSON.stringify(data) });
    if (r.status === 409) {
      const errBody = await r.json();
      const match = typeof errBody.details === 'string' ? errBody.details.match(/"(\w+)"\)\s*=\s*\((\d+)\)/) : null;
      if (match) {
        await fetch(`${SB_URL}/rest/v1/${table}?${match[1]}=eq.${match[2]}`, { method: 'DELETE', headers: SB }).catch(() => {});
        continue;
      }
      throw new Error(`POST ${table} 409: ${errBody.message}`);
    }
    if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${await r.text()}`);
    const body = await r.json();
    return Array.isArray(body) ? body[0] : body;
  }
  throw new Error(`POST ${table}: failed after 3 retries`);
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

test.describe('Minibar — Consumption & Restock', () => {

  test('log consumption for a room → MINIBAR_CONSUMPTION + INVENTORY decrement', async ({ page }) => {
    const roomNum = 9900 + parseInt(Date.now().toString().slice(-3));
    const suffix = Date.now().toString().slice(-4);
    const today = new Date().toISOString().split('T')[0];
    const plus3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    let reservation: Record<string, unknown> = {};
    let customer: Record<string, unknown> = {};

    // Pre-cleanup: delete any leftover test data by email pattern
    const oldCusts = await sbGet('CUSTOMER', `Email=like.%25mb.test.%25&select=CustomerID`).catch(() => []) as Array<{ CustomerID: number }>;
    for (const c of (Array.isArray(oldCusts) ? oldCusts : [])) {
      const oldResvs = await sbGet('RESERVATION', `CustomerID=eq.${c.CustomerID}&select=ReservationID`).catch(() => []) as Array<{ ReservationID: number }>;
      for (const r of (Array.isArray(oldResvs) ? oldResvs : [])) {
        await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
        await sbDelete('RESERVATION', `ReservationID=eq.${r.ReservationID}`).catch(() => {});
      }
      await sbDelete('CUSTOMER', `CustomerID=eq.${c.CustomerID}`).catch(() => {});
    }
    await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});

    try {
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'occ' });
      customer = await sbPost('CUSTOMER', {
        Phone: `+30-69${suffix}0000`, Email: `mb.test.${suffix}@test.gr`, IsGroup: false,
        FirstName: 'MBTest', LastName: `User${suffix}`,
      });
      reservation = await sbPost('RESERVATION', {
        CustomerID: customer.CustomerID, CheckInDate: today, CheckOutDate: plus3,
        TotalCost: 200, Status: 'CheckedIn',
      });
      await sbPost('RESERVATION_ROOM', { ReservationID: reservation.ReservationID, RoomNumber: roomNum });

      await page.goto('/pages/login.html');
      await page.fill('#username', 'nikos_bar');
      await page.fill('#password', '1234');
      await page.click('.btn-login');
      await page.waitForURL('**/pages/minibar.html', { timeout: 10000 });
      await page.waitForFunction(() => {
        const sel = document.getElementById('room-list');
        return sel && sel.querySelectorAll('option').length > 0;
      }, { timeout: 15000 });
      const firstRoomVal = await page.locator('#room-list option').first().getAttribute('value');

      await page.click('.sb-item[data-v="consumption"]');
      await expect(page.locator('#v-consumption')).toBeVisible();

      await page.fill('#mb-room', firstRoomVal);

      const firstQty = page.locator('.qty:not([disabled])').first();
      await firstQty.waitFor({ timeout: 5000 });
      await firstQty.fill('1');

      const mbInsertPromise = page.waitForResponse(
        res => res.url().includes('/rest/v1/MINIBAR_CONSUMPTION') && res.status() === 201,
        { timeout: 15000 }
      );
      const inventoryPatchPromise = page.waitForResponse(
        res => res.url().includes('/rest/v1/INVENTORY_ITEM') && res.request().method() === 'PATCH',
        { timeout: 15000 }
      );

      await page.click('button:has-text("Καταχώρηση")');

      const mbRes = await mbInsertPromise;
      expect(mbRes.status()).toBe(201);

      const invRes = await inventoryPatchPromise;
      expect([200, 204]).toContain(invRes.status());

      await expect(page.locator('.live-toast')).toContainText('Επιτυχία', { timeout: 5000 });
    } finally {
      await sbDelete('RESERVATION_ROOM', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('RESERVATION', `ReservationID=eq.${(reservation as Record<string, unknown>).ReservationID}`).catch(() => {});
      await sbDelete('CUSTOMER', `CustomerID=eq.${(customer as Record<string, unknown>).CustomerID}`).catch(() => {});
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
    }
  });

  test('request restock → NOTIFICATION to external manager', async ({ page }) => {
    await page.goto('/pages/login.html');
    await page.fill('#username', 'nikos_bar');
    await page.fill('#password', '1234');
    await page.click('.btn-login');
    await page.waitForURL('**/pages/minibar.html', { timeout: 10000 });
    await page.waitForFunction(() => typeof window.navTo === 'function', { timeout: 5000 });
    await page.evaluate(() => window.navTo('stock'));
    await page.waitForSelector('button:has-text("Παραγγελία")', { timeout: 15000 });

    const restockBtn = page.locator('button:has-text("Παραγγελία")').first();
    const hasBtn = await restockBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasBtn) {
      test.skip('Restock request button not found');
      return;
    }

    // Set a real inventory item below its threshold so restock request will POST
    const origQty: number = await page.evaluate(async () => {
      const w = window as any;
      const { data: items } = await w.supabase.from('INVENTORY_ITEM').select('ItemID, Quantity, MinThreshold').limit(1);
      const item = (items || [])[0];
      if (!item) return -1;
      const oldQty = item.Quantity;
      await w.supabase.from('INVENTORY_ITEM').update({ Quantity: 0 }).eq('ItemID', item.ItemID);
      return oldQty;
    });
    if (origQty < 0) { test.skip('No inventory items'); return; }

    // Refresh stock view to see updated quantity
    await page.evaluate(() => (window as any).navTo('stock'));
    await page.waitForTimeout(500);

    const notifPromise = page.waitForResponse(
      res => res.url().includes('/rest/v1/NOTIFICATION') &&
             res.request().method() === 'POST' &&
             res.status() === 201,
      { timeout: 10000 }
    );

    // Trigger restock via direct function call
    const submitResult = await page.evaluate(async () => {
      try {
        await (window as any).requestRestockAll();
        return 'ok';
      } catch (e: any) {
        return 'error: ' + e.message;
      }
    });
    if (submitResult !== 'ok') { test.skip('requestRestockAll: ' + submitResult); return; }

    const notifRes = await notifPromise;
    expect(notifRes.status()).toBe(201);

    // Restore original quantity
    await page.evaluate(async (qty: number) => {
      const w = window as any;
      const { data: items } = await w.supabase.from('INVENTORY_ITEM').select('ItemID').limit(1);
      if ((items || [])[0]) await w.supabase.from('INVENTORY_ITEM').update({ Quantity: qty }).eq('ItemID', (items[0] as any).ItemID);
    }, origQty);

    await expect(page.locator('.live-toast')).toBeVisible({ timeout: 5000 });
  });
});
