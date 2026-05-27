// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Admin — Rented Shops', () => {

  test('create a rented shop', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#rentals-body', { timeout: 20000 });

    // Click add rental
    const addBtn = page.locator('button:has-text("Προσθήκη Καταστήματος")').first();
    if (await addBtn.isVisible()) await addBtn.click();
    await page.waitForSelector('.inv-overlay', { timeout: 5000 });

    // Fill form
    await page.fill('#inv-modal input[name="shopName"]', `E2E Shop ${suffix}`);
    await page.fill('#inv-modal input[name="tenantName"]', `Tenant ${suffix}`);
    await page.fill('#inv-modal input[name="monthlyRent"]', '1200');

    const postShop = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/RENTED_SHOP') && resp.request().method() === 'POST' && resp.status() === 201
    );

    await page.click('.inv-overlay .btn-dark:has-text("Αποθήκευση")');
    await postShop;

    await expect(page.locator('#toast-container')).toContainText('δημιουργήθηκε', { timeout: 5000 });
  });
});
