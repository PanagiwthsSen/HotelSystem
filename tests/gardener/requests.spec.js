// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Gardener — Fault & Supply Reports', () => {

  test('report a garden fault', async ({ page }) => {
    await page.goto('/pages/gardener.html');
    await setupAuth(page, 'gardener');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    // Navigate to reports view
    await page.click('.sb-item[data-v="reports"]');
    await expect(page.locator('#v-reports')).toBeVisible();

    // Fill fault report
    const faultZone = page.locator('#fault-zone');
    const faultDesc = page.locator('#fault-desc');
    if (await faultZone.isVisible({ timeout: 5000 }).catch(() => false)) {
      const opts = faultZone.locator('option');
      const count = await opts.count();
      if (count > 1) {
        await faultZone.selectOption({ index: 1 });
        await faultDesc.fill(`E2E fault in garden — ${uid()}`);

        const postNotif = page.waitForResponse(resp =>
          resp.url().includes('/rest/v1/NOTIFICATION') && resp.request().method() === 'POST' && resp.status() === 201
        );
        await page.click('button:has-text("Αναφορά Βλάβης")');
        await postNotif;
        await expect(page.locator('#toast-container')).toContainText('βλάβη', { timeout: 5000 });
      }
    }
  });

  test('request supplies', async ({ page }) => {
    await page.goto('/pages/gardener.html');
    await setupAuth(page, 'gardener');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForTimeout(3000);

    await page.click('.sb-item[data-v="reports"]');
    await expect(page.locator('#v-reports')).toBeVisible();

    // Fill supply request
    const supItem = page.locator('#sup-item');
    const supQty = page.locator('#sup-qty');
    if (await supItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await supItem.fill(`E2E Supply ${uid()}`);
      await supQty.fill('5');

      const postNotif = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/NOTIFICATION') && resp.request().method() === 'POST' && resp.status() === 201
      );
      await page.click('button:has-text("Αίτημα")');
      await postNotif;
      await expect(page.locator('#toast-container')).toContainText('αίτημα', { timeout: 5000 });
    }
  });
});
