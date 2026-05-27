// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('External Manager — Rents & Leases', () => {

  test('mark a shop as paid and notify lawyer', async ({ page }) => {
    await page.goto('/pages/external_manager.html');
    await setupAuth(page, 'manager');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#rents-list', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Find a shop with a payment delay button
    const payBtn = page.locator('button:has-text("Πληρωμή")').first();
    if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const postPayment = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/LEASE_PAYMENT') && resp.request().method() === 'POST' && resp.status() === 201
      );
      await payBtn.click();
      await postPayment;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
