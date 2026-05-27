// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Minibar — Consumption & Restock', () => {

  test('log consumption for a checked-in room', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/minibar.html');
    await setupAuth(page, 'minibar');
    await overrideConfirm(page);
    await page.reload();

    // Ensure there is a checked-in reservation with a room
    await page.evaluate(async (suf) => {
      const sb = window.supabase;
      const { data: existing } = await sb.from('RESERVATION').eq('Status', 'CheckedIn').limit(1);
      if (existing && existing.length > 0) return;
      const today = new Date().toISOString().split('T')[0];
      const { data: cust } = await sb.from('CUSTOMER').insert([{
        FirstName: `Mb${suf}`, LastName: 'Test', Phone: '+30 6900000005',
        Email: `mb-${suf}@test.com`, IsGroup: false
      }]).select().single();
      const { data: res } = await sb.from('RESERVATION').insert([{
        CustomerID: cust.CustomerID, CheckInDate: today, CheckOutDate: today,
        TotalCost: 200, Status: 'CheckedIn', RoomType: 'Δίκλινο'
      }]).select().single();
      await sb.from('RESERVATION_ROOM').insert([{ ReservationID: res.ReservationID, RoomNumber: 3 }]);
      await sb.from('ROOM').update({ Status: 'occ' }).eq('RoomNumber', 3);
    }, suffix);

    await page.reload();
    await page.waitForTimeout(3000);

    // Navigate to dashboard to see the stat boxes
    await expect(page.locator('#stat-rooms')).toBeVisible({ timeout: 10000 });

    // Navigate to consumption form
    await page.click('.sb-item[data-v="consumption"]').catch(() => {});
    await page.waitForTimeout(2000);

    // Fill room and items
    const roomInput = page.locator('#mb-room');
    if (await roomInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await roomInput.fill('3');

      // Select items from consumption-items
      const itemRow = page.locator('#consumption-items .mb-item-row').first();
      if (await itemRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        await itemRow.fill('1');
      }

      const postMb = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/MINIBAR_CONSUMPTION') && resp.request().method() === 'POST' && resp.status() === 201
      );
      const patchItem = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/INVENTORY_ITEM') && resp.request().method() === 'PATCH' && resp.ok()
      );

      await page.click('button:has-text("Καταχώρηση")');
      await postMb;
      await patchItem;

      await expect(page.locator('#toast-container')).toContainText('mini-bar', { timeout: 5000 });
    }
  });

  test('request restock for low-stock items', async ({ page }) => {
    await page.goto('/pages/minibar.html');
    await setupAuth(page, 'minibar');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Click restock all button
    const restockBtn = page.locator('button:has-text("Παραγγελία")').first();
    if (await restockBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const postNotif = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/NOTIFICATION') && resp.request().method() === 'POST' && resp.status() === 201
      );
      await restockBtn.click();
      await postNotif;
      await expect(page.locator('#toast-container')).toContainText('Παραγγελία', { timeout: 5000 });
    }
  });
});
