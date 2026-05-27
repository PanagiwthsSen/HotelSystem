// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Admin — Revenue Dashboard', () => {

  test('revenue chart renders with data and filters by date range', async ({ page }) => {
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Wait for the chart canvas
    await page.waitForSelector('#rev-chart', { timeout: 20000 });
    await page.waitForTimeout(2000); // Allow Chart.js to render

    // Chart should have a canvas element rendered by Chart.js
    const chartCanvas = page.locator('#rev-chart canvas');
    await expect(chartCanvas).toBeVisible({ timeout: 5000 });

    // Date range inputs should exist
    const startInput = page.locator('#rev-start-date');
    const endInput = page.locator('#rev-end-date');
    await expect(startInput).toBeVisible();
    await expect(endInput).toBeVisible();

    // Change date range — should trigger a new GET
    const receiptsGet = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/RECEIPT') && resp.request().method() === 'GET' && resp.ok()
    );
    await startInput.fill('2026-01-01');
    await endInput.fill('2026-12-31');
    // Trigger change event
    await startInput.dispatchEvent('input');
    await endInput.dispatchEvent('input');
    await receiptsGet;

    // Stats boxes should have numeric values (not "€0")
    const totalEl = page.locator('#rev-total');
    await expect(totalEl).not.toContainText('€0');
  });
});
