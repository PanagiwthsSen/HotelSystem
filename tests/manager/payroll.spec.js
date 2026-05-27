// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Internal Manager — Payroll', () => {

  test('mark a driver as paid', async ({ page }) => {
    await page.goto('/pages/internal_manager.html');
    await setupAuth(page, 'manager');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#driver-payroll-table', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Find a "Πληρωμή" button
    const payBtn = page.locator('button:has-text("Πληρωμή")').first();
    if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const patchEmp = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/EMPLOYEE') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await payBtn.click();
      await patchEmp;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
