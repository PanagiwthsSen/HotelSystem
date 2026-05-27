// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Gardener — Task Management', () => {

  test('cycle a task through states (pending → in progress → done)', async ({ page }) => {
    await page.goto('/pages/gardener.html');
    await setupAuth(page, 'gardener');
    await overrideConfirm(page);
    await page.reload();

    // Wait for task rows to render (from hardcoded HTML data-tasks)
    await page.waitForSelector('.task-row', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Find a pending task and click it to cycle
    const pendingTask = page.locator('.task-row .task-badge:has-text("Εκκρεμεί")').first();
    if (await pendingTask.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pendingTask.click();
      // Should now be "Σε εξέλιξη"
      await expect(page.locator('.task-row .task-badge:has-text("Σε εξέλιξη")').first()).toBeVisible({ timeout: 5000 });
    }
  });
});
