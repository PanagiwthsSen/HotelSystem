// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Internal Manager — Leave Management', () => {

  test('add leave days to an employee', async ({ page }) => {
    await page.goto('/pages/internal_manager.html');
    await setupAuth(page, 'manager');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#leave-emp', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Select an employee
    const leaveSelect = page.locator('#leave-emp');
    const opts = leaveSelect.locator('option');
    const count = await opts.count();
    if (count > 1) {
      await leaveSelect.selectOption({ index: 1 });
      await page.fill('#leave-days', '1');

      const patchEmp = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/EMPLOYEE') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await page.click('button:has-text("Προσθήκη")');
      await patchEmp;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
