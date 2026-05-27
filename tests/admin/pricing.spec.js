// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Admin — Room Pricing', () => {

  test('save updated room prices', async ({ page }) => {
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Wait for price sliders
    await page.waitForSelector('#price-m', { timeout: 20000 });

    // Adjust a price slider
    const slider = page.locator('#price-m');
    await slider.fill('180');

    // Click save
    const patchRooms = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
    );
    const postNotif = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/NOTIFICATION') && resp.request().method() === 'POST' && resp.status() === 201
    );

    await page.click('button:has-text("Αποθήκευση")');

    await patchRooms;
    await postNotif;

    // Toast confirms
    await expect(page.locator('#toast-container')).toContainText('αποθηκεύτηκαν', { timeout: 5000 });
  });
});
