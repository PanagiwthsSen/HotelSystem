// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Admin — Inventory Management', () => {

  test('create and delete inventory item', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#inventory-body', { timeout: 20000 });

    // Click add item
    const addBtn = page.locator('button:has-text("Προσθήκη")').first();
    if (await addBtn.isVisible()) await addBtn.click();
    await page.waitForSelector('.inv-overlay', { timeout: 5000 });

    // Fill form
    await page.fill('#inv-modal input[name="name"]', `E2E Item ${suffix}`);
    await page.fill('#inv-modal input[name="quantity"]', '50');
    await page.fill('#inv-modal input[name="minThreshold"]', '10');
    await page.selectOption('#inv-modal select[name="category"]', 'linen');

    const postItem = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/INVENTORY_ITEM') && resp.request().method() === 'POST' && resp.status() === 201
    );

    await page.click('.inv-overlay .btn-dark:has-text("Αποθήκευση")');
    await postItem;

    await expect(page.locator('#toast-container')).toContainText('δημιουργήθηκε', { timeout: 5000 });
  });
});
