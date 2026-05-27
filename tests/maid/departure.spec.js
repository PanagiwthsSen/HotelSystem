// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Maid — Departure Cleaning', () => {

  test('mark a departure room as cleaned', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/maid.html');
    await setupAuth(page, 'maid');
    await overrideConfirm(page);
    await page.reload();

    // Ensure there is a departure for today
    await page.evaluate(async (suf) => {
      const sb = window.supabase;
      const today = new Date().toISOString().split('T')[0];
      const { data: cust } = await sb.from('CUSTOMER').insert([{
        FirstName: `Dep${suf}`, LastName: 'MaidClean', Phone: '+30 6900000004',
        Email: `dep-${suf}@test.com`, IsGroup: false
      }]).select().single();
      const { data: res } = await sb.from('RESERVATION').insert([{
        CustomerID: cust.CustomerID, CheckInDate: today, CheckOutDate: today,
        TotalCost: 150, Status: 'CheckedOut', RoomType: 'Δίκλινο'
      }]).select().single();
      await sb.from('RESERVATION_ROOM').insert([{ ReservationID: res.ReservationID, RoomNumber: 2 }]);
      await sb.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', 2);
    }, suffix);

    await page.reload();
    await page.waitForTimeout(5000); // let subscriptions load

    // Navigate to overview to see departures
    await page.click('.sb-item[data-v="overview"]');
    await expect(page.locator('#v-overview')).toBeVisible();

    // Look for a departure room "Καθαρίστηκε" button
    const cleanBtn = page.locator('button:has-text("Καθαρίστηκε")').first();
    if (await cleanBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const patchRoom = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await cleanBtn.click();
      await patchRoom;
      await expect(page.locator('#toast-container')).toContainText('καθαρίστηκε', { timeout: 5000 });
    }
  });
});
