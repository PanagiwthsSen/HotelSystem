// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Internal Manager — Trips (Fleet)', () => {

  test('create a new trip', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/internal_manager.html');
    await setupAuth(page, 'manager');
    await overrideConfirm(page);
    await page.reload();

    // Wait for trip form to be populated
    await page.waitForSelector('#trip-driver', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Navigate to fleet / trips section
    await page.click('.sb-item[data-v="fleet"]').catch(() => {});
    await page.waitForTimeout(1000);

    // Fill trip form
    const driverSelect = page.locator('#trip-driver');
    const vehicleSelect = page.locator('#trip-vehicle');
    if (await driverSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Select first available driver and vehicle
      const driverOpts = driverSelect.locator('option');
      const dCount = await driverOpts.count();
      if (dCount > 1) await driverSelect.selectOption({ index: 1 });

      const vehicleOpts = vehicleSelect.locator('option');
      const vCount = await vehicleOpts.count();
      if (vCount > 1) await vehicleSelect.selectOption({ index: 1 });

      await page.fill('#trip-destination', `E2E Trip ${suffix}`);
      await page.fill('#trip-cost', '100');

      const postTrip = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/TRIP') && resp.request().method() === 'POST' && resp.status() === 201
      );
      const patchVehicle = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/VEHICLE') && resp.request().method() === 'PATCH' && resp.ok()
      );

      await page.click('button:has-text("Καταχώρηση")');
      await postTrip;
      await patchVehicle;

      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
