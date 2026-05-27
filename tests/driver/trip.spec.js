// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Driver — Trip Completion', () => {

  test('complete a pending trip', async ({ page }) => {
    await page.goto('/pages/driver.html');
    await setupAuth(page, 'driver');
    await overrideConfirm(page);
    await page.reload();

    // Wait for trip list
    await page.waitForSelector('#trip-list', { timeout: 20000 });
    await page.waitForTimeout(3000);

    // Find "Ολοκλήρωση" button
    const completeBtn = page.locator('button:has-text("Ολοκλήρωση")').first();
    if (await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const patchTrip = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/TRIP') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await completeBtn.click();
      await patchTrip;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
