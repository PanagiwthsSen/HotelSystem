// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Maid — Shift Report', () => {

  test('submit end-of-shift report', async ({ page }) => {
    await page.goto('/pages/maid.html');
    await setupAuth(page, 'maid');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to report view
    await page.click('.sb-item[data-v="report"]');
    await expect(page.locator('#v-report')).toBeVisible();

    // Fill notes
    const notes = page.locator('#rep-notes');
    await expect(notes).toBeVisible({ timeout: 5000 });
    await notes.fill('E2E test shift report — all rooms cleaned');

    // Submit
    await page.click('button:has-text("Υποβολή Αναφοράς")');

    // Should show toast confirmation
    await expect(page.locator('#toast-container')).toContainText('αναφορά', { timeout: 5000 });
  });
});
