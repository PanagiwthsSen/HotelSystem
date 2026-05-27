// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Maid — Room Cleaning', () => {

  test('set room in progress then mark done', async ({ page }) => {
    await page.goto('/pages/maid.html');
    await setupAuth(page, 'maid');
    await overrideConfirm(page);
    await page.reload();

    // Wait for room list
    await page.waitForSelector('#room-list', { timeout: 20000 });
    await page.waitForTimeout(3000); // Allow Realtime subscriptions + render

    // Navigate to rooms view
    await page.click('.sb-item[data-v="rooms"]');
    await expect(page.locator('#v-rooms')).toBeVisible();

    // Find a "free" room card and click to start cleaning
    const freeRoom = page.locator('#room-list .rc-free').first();
    await expect(freeRoom).toBeVisible({ timeout: 10000 });

    // Click the room to start cleaning
    await freeRoom.click();

    // Should show a toast or confirmation
    const patchRoomCleaning = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
    );
    // The action might trigger a showConfirm for "set in progress?"
    await page.click('.btn-dark:has-text("Ναι")').catch(() => {});
    await patchRoomCleaning;

    // Now mark it as done
    const cleanRoom = page.locator('#room-list .rc-cleaning').first();
    if (await cleanRoom.isVisible()) {
      await cleanRoom.click();
      const patchRoomClean = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await page.click('.btn-dark:has-text("Ναι")').catch(() => {});
      await patchRoomClean;

      await expect(page.locator('#toast-container')).toContainText('ολοκληρώθηκε', { timeout: 5000 });
    }
  });
});
