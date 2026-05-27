// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from './helpers.js';

test.describe('Receptionist — Check-Out Workflow', () => {

  test('completes check-out and marks room dirty', async ({ page }) => {
    const suffix = uid();

    await page.goto('/pages/receptionist.html');
    await setupAuth(page, 'receptionist');
    await overrideConfirm(page);
    await page.reload();

    // Wait for dropdown population
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Create a checked-in reservation first via page.evaluate
    const reservationId = await page.evaluate(async (suf) => {
      const sb = window.supabase;
      const today = new Date().toISOString().split('T')[0];
      const { data: cust } = await sb.from('CUSTOMER').insert([{
        FirstName: `Checkout${suf}`, LastName: 'TestUser', Phone: '+30 6900000003',
        Email: `checkout-${suf}@test.com`, IsGroup: false
      }]).select().single();
      const { data: res } = await sb.from('RESERVATION').insert([{
        CustomerID: cust.CustomerID, CheckInDate: today, CheckOutDate: today,
        TotalCost: 200, Status: 'CheckedIn', RoomType: 'Δίκλινο'
      }]).select().single();
      await sb.from('RESERVATION_ROOM').insert([{ ReservationID: res.ReservationID, RoomNumber: 1 }]);
      await sb.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', 1);
      return res.ReservationID;
    }, suffix);

    expect(reservationId).toBeTruthy();

    // Reload page to pick up the data
    await page.reload();
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Navigate to departures
    await page.click('.sb-item[data-v="departures"]');
    await expect(page.locator('#v-departures')).toBeVisible();
    await page.waitForSelector('#v-departures table tbody tr', { timeout: 10000 });

    // Find our row and click Check-out
    const checkoutBtn = page.locator('#v-departures table tbody tr .btn-dark:has-text("Check-out")').first();
    await expect(checkoutBtn).toBeVisible({ timeout: 5000 });
    await checkoutBtn.click();

    // Receipt modal should appear
    await expect(page.locator('.receipt-overlay')).toBeVisible({ timeout: 5000 });

    // Confirm the receipt
    const patchReservation = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/RESERVATION') && resp.request().method() === 'PATCH' && resp.ok()
    );
    const patchRoom = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
    );

    await page.click('#receipt-confirm');
    await patchReservation;
    await patchRoom;

    // Departures table should now show "C/O OK"
    await expect(page.locator('#v-departures table tbody tr .pill.p-g:has-text("Ολοκλ.")').first()).toBeVisible({ timeout: 5000 });
  });
});
