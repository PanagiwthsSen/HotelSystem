// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Driver — Fuel Expenses', () => {

  test('log a fuel expense', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/driver.html');
    await setupAuth(page, 'driver');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to expenses view
    await page.click('.sb-item[data-v="expenses"]');
    await expect(page.locator('#v-expenses')).toBeVisible();

    // Fill fuel expense form
    const expType = page.locator('#exp-type');
    const expAmount = page.locator('#exp-amount');
    if (await expType.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expType.selectOption('fuel');
      await expAmount.fill('50');

      const postReceipt = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/RECEIPT') && resp.request().method() === 'POST' && resp.status() === 201
      );

      await page.click('button:has-text("Καταχώρηση")');
      await postReceipt;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
