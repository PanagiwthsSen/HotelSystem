// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Maid — Minibar Charge', () => {

  test('log a minibar consumption', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/maid.html');
    await setupAuth(page, 'maid');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to minibar view
    await page.click('.sb-item[data-v="minibar"]');
    await expect(page.locator('#v-minibar')).toBeVisible();

    // Fill the minibar charge form
    const roomInput = page.locator('#mb-room-inp');
    const itemsInput = page.locator('#mb-items-inp');
    const totalInput = page.locator('#mb-total-inp');

    if (await roomInput.isVisible()) {
      await roomInput.fill('1');
      await itemsInput.fill('2');
      await totalInput.fill('25');

      const postMb = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/MINIBAR_CONSUMPTION') && resp.request().method() === 'POST' && resp.status() === 201
      );

      await page.click('button:has-text("Καταχώρηση")');
      await postMb;

      await expect(page.locator('#toast-container')).toContainText('mini-bar', { timeout: 5000 });
    }
  });
});
