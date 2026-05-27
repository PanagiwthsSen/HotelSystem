// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Maid — Linen Management', () => {

  test('send and receive linen', async ({ page }) => {
    await page.goto('/pages/maid.html');
    await setupAuth(page, 'maid');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to linen view
    await page.click('.sb-item[data-v="linen"]');
    await expect(page.locator('#v-linen')).toBeVisible();

    // Send linen — find a linen item and click "Αποστολή"
    const sendBtn = page.locator('#linen-send-list .btn:has-text("Αποστολή")').first();
    if (await sendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const patchItem = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/INVENTORY_ITEM') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await sendBtn.click();
      await patchItem;
      await page.waitForTimeout(1000);
    }

    // Receive linen
    const receiveBtn = page.locator('#linen-receive-body .btn:has-text("Παραλαβή")').first();
    if (await receiveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const patchItem = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/INVENTORY_ITEM') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await receiveBtn.click();
      await patchItem;
    }
  });
});
