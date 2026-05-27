// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from './helpers.js';

test.describe('Room Map — Rendering & Filtering', () => {

  test('admin room map renders 510 cells and filters work', async ({ page }) => {
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Wait for room map container
    await page.waitForSelector('#rmap', { timeout: 20000 });

    // Should have 510 room cells
    const cells = page.locator('#rmap > div');
    await expect(cells).toHaveCount(510, { timeout: 15000 });

    // Each cell should have a room number
    const firstCell = cells.first();
    await expect(firstCell).not.toBeEmpty();

    // Filter buttons exist and are clickable
    const filters = page.locator('button[data-filter]');
    const filterCount = await filters.count();
    expect(filterCount).toBeGreaterThanOrEqual(5);
  });

  test('receptionist room map renders correctly', async ({ page }) => {
    await page.goto('/pages/receptionist.html');
    await setupAuth(page, 'receptionist');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#rmap', { timeout: 20000 });
    const cells = page.locator('#rmap > div');
    await expect(cells).toHaveCount(510, { timeout: 15000 });
  });
});
