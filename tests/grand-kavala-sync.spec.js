// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Grand Kavala Hotel — E2E Data Sync', () => {

  test('New Reservation syncs data between frontend and Supabase', async ({ page }) => {
    // ── 1. Navigate and set up auth / modal override ──────────────
    await page.goto('/pages/receptionist.html');

    // Override custom confirm modal to auto-accept
    await page.evaluate(() => {
      window.showConfirm = () => Promise.resolve(true);
    });

    // Set localStorage auth session (used for booking history tracking)
    await page.evaluate(() => {
      localStorage.setItem('hotel_user', JSON.stringify({
        id: 5,
        name: 'Maria Reception',
        Role: 'receptionist'
      }));
    });

    // ── 2. Wait for room-type dropdown to populate ──────────────
    // The dropdown gets options after fetchRoomPrices() completes
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // ── 3. Navigate to the New Reservation form ──────────────
    await page.click('.sb-item[data-v="new-booking"]');
    await expect(page.locator('#v-new-booking')).toBeVisible();

    // ── 4. Set future dates (avoid conflicts with existing data) ──
    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 30);
    const checkOut = new Date(today);
    checkOut.setDate(today.getDate() + 33);

    const fmt = (d) => d.toISOString().split('T')[0];
    await page.fill('#nb-in', fmt(checkIn));
    await page.fill('#nb-out', fmt(checkOut));

    // ── 5. Search for available rooms ──────────────────────────────
    await page.click('button:has-text("Αναζήτηση Δωματίων")');
    await page.waitForSelector('#avail-rooms .room-opt', { timeout: 10000 });

    // ── 6. Fill customer details (unique per run) ─────────────────
    const suffix = Date.now().toString(36);
    const firstName = `Test${suffix}`;
    const lastName = 'SyncUser';

    await page.fill('#nb-first', firstName);
    await page.fill('#nb-last', lastName);
    await page.fill('#nb-phone', '+30 6900000001');
    await page.fill('#nb-email', `test-${suffix}@e2e-sync.com`);

    // ── 7. Set up Supabase response interceptors (before submit) ──
    const customerInsertDone = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/CUSTOMER') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201
    );

    const rpcDone = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/rpc/book_room_atomic') &&
      resp.request().method() === 'POST' &&
      resp.ok()
    );

    // ── 8. Submit the form ─────────────────────────────────────────
    await page.click('button:has-text("Καταχώρηση")');

    // ── 9. Assert both Supabase calls succeeded ────────────────────
    const customerResp = await customerInsertDone;
    expect(customerResp.ok()).toBe(true);

    const rpcResp = await rpcDone;
    expect(rpcResp.ok()).toBe(true);

    // ── 10. Verify frontend UI updated ─────────────────────────────
    // After submission the app navigates to the dashboard view
    await expect(page.locator('#v-dash')).toBeVisible({ timeout: 10000 });

    // Dashboard stats should be populated (not placeholder "--")
    await expect(page.locator('#dash-occ-val')).not.toHaveText('--%');

    // ── 11. Verify new reservation appears in "All Bookings" table ─
    await page.click('.sb-item[data-v="bookings"]');
    await expect(page.locator('#v-bookings')).toBeVisible();

    await page.waitForSelector('#bk-body tr', { timeout: 10000 });
    await expect(page.locator('#bk-body')).toContainText(lastName);
  });

});
