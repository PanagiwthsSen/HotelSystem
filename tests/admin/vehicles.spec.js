// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Admin — Vehicle Management', () => {

  test('create a vehicle', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    await page.waitForSelector('#vehicles-body', { timeout: 20000 });

    // Click add vehicle
    const addBtn = page.locator('#vehicles-body button:has-text("Προσθήκη")');
    if (await addBtn.isVisible()) await addBtn.click();
    await page.waitForSelector('.inv-overlay', { timeout: 5000 });

    // Fill form
    await page.fill('#inv-modal input[name="licensePlate"]', `E2E-${suffix.slice(0, 6).toUpperCase()}`);
    await page.fill('#inv-modal input[name="type"]', 'car');
    await page.selectOption('#inv-modal select[name="status"]', 'available');

    const postVehicle = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/VEHICLE') && resp.request().method() === 'POST' && resp.status() === 201
    );

    await page.click('.inv-overlay .btn-dark:has-text("Αποθήκευση")');
    await postVehicle;

    await expect(page.locator('#toast-container')).toContainText('δημιουργήθηκε', { timeout: 5000 });
  });
});
