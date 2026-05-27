// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm } from '../helpers.js';

test.describe('Admin — Backup', () => {

  test('run full database backup', async ({ page }) => {
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Wait for backup section to be accessible
    await page.waitForSelector('#backup-tbody', { timeout: 20000 });

    // Click the backup button
    const backupBtn = page.locator('button:has-text("Δημιουργία Backup")').first();
    await expect(backupBtn).toBeVisible({ timeout: 5000 });

    // Listen for multiple GET requests across all tables (at least 10 tables)
    const backupPromises = [];
    const tables = ['EMPLOYEE', 'ROOM', 'RESERVATION', 'CUSTOMER', 'COMPLAINT',
      'INVENTORY_ITEM', 'VEHICLE', 'TRIP', 'RENTED_SHOP', 'RECEIPT',
      'MINIBAR_CONSUMPTION', 'NOTIFICATION', 'SHIFT', 'LEASE_PAYMENT',
      'VEHICLE_SERVICE', 'RESERVATION_ROOM'];
    for (const table of tables) {
      backupPromises.push(
        page.waitForResponse(resp =>
          resp.url().includes(`/rest/v1/${table}`) && resp.request().method() === 'GET' && resp.ok()
        )
      );
    }

    await backupBtn.click();

    // Wait for all table GETs to complete
    await Promise.all(backupPromises);

    // Toast should confirm backup
    await expect(page.locator('#toast-container')).toContainText('Backup', { timeout: 10000 });
  });
});
