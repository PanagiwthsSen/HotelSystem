// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Admin — User Management', () => {

  test('create a new user', async ({ page }) => {
    const suffix = uid();
    const username = `e2euser_${suffix}`;
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Navigate to users section
    await page.waitForSelector('#users-body', { timeout: 20000 });

    // Click add user
    const addBtn = page.locator('button:has-text("Προσθήκη Χρήστη")');
    if (await addBtn.isVisible()) await addBtn.click();
    await page.waitForSelector('.inv-overlay', { timeout: 5000 });

    // Fill form
    await page.fill('#inv-modal input[name="firstName"]', `First${suffix}`);
    await page.fill('#inv-modal input[name="lastName"]', `Last${suffix}`);
    await page.fill('#inv-modal input[name="username"]', username);
    await page.fill('#inv-modal input[name="password"]', 'test1234');
    await page.fill('#inv-modal input[name="salary"]', '1500');
    await page.selectOption('#inv-modal select[name="role"]', 'maid');

    const postEmployee = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/EMPLOYEE') && resp.request().method() === 'POST' && resp.status() === 201
    );

    await page.click('.inv-overlay .btn-dark:has-text("Αποθήκευση")');
    await postEmployee;

    await expect(page.locator('#toast-container')).toContainText('δημιουργήθηκε', { timeout: 5000 });
  });

  test('toggle user active status', async ({ page }) => {
    const suffix = uid();
    // Ensure there is at least one user to toggle
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();
    await page.waitForSelector('#users-body tr', { timeout: 20000 });

    const toggleBtn = page.locator('#users-body button:has-text("Απενεργοποίηση")').first();
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      const patchEmp = page.waitForResponse(resp =>
        resp.url().includes('/rest/v1/EMPLOYEE') && resp.request().method() === 'PATCH' && resp.ok()
      );
      await page.click('.btn-dark:has-text("Ναι")');
      await patchEmp;
      await expect(page.locator('#toast-container')).toContainText('επιτυχώς', { timeout: 5000 });
    }
  });
});
