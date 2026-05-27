// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Driver — Vehicle Fault Report', () => {

  test('report a vehicle fault', async ({ page }) => {
    await page.goto('/pages/driver.html');
    await setupAuth(page, 'driver');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to fleet view to see fault form
    await page.click('.sb-item[data-v="fleet"]');
    await expect(page.locator('#v-fleet')).toBeVisible();

    // Fill fault report form
    const faultVehicle = page.locator('#fault-vehicle');
    const faultDesc = page.locator('#fault-desc');
    if (await faultVehicle.isVisible({ timeout: 5000 }).catch(() => false)) {
      const opts = faultVehicle.locator('option');
      const count = await opts.count();
      if (count > 1) {
        await faultVehicle.selectOption({ index: 1 });
        await faultDesc.fill(`E2E test fault report — ${uid()}`);

        const postNotif = page.waitForResponse(resp =>
          resp.url().includes('/rest/v1/NOTIFICATION') && resp.request().method() === 'POST' && resp.status() === 201
        );

        await page.click('button:has-text("Αναφορά")');
        await postNotif;
        await expect(page.locator('#toast-container')).toContainText('αναφορά', { timeout: 5000 });
      }
    }
  });
});
