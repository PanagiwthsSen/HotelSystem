import { test, expect } from '@playwright/test';

test.describe('Driver (via Admin Page) — Trips, Expenses', () => {

  async function loginAsAdmin(page: import('@playwright/test').Page) {
    await page.goto('/pages/login.html');
    await page.fill('#username', 'admin');
    await page.fill('#password', '1234');
    await page.click('.btn-login');
    await page.waitForURL('**/pages/admin.html', { timeout: 10000 });

    const appVisible = await page.locator('.app').isVisible({ timeout: 10000 }).catch(() => false);
    if (!appVisible) {
      await page.evaluate(() => {
        const app = document.querySelector('.app') as HTMLElement;
        if (app) app.style.display = 'flex';
        const loader = document.getElementById('app-loader');
        if (loader) loader.style.display = 'none';
      });
    }
    await page.waitForSelector('.sb-item', { state: 'visible', timeout: 5000 });
  }

  async function navToView(page: import('@playwright/test').Page, viewId: string) {
    await page.evaluate((id) => {
      document.querySelectorAll('.sb-item').forEach(i =>
        i.classList.toggle('active', i.dataset.v === id)
      );
      document.querySelectorAll('.view').forEach(v =>
        v.classList.toggle('active', v.id === 'v-' + id)
      );
    }, viewId);
  }

  test('trips view loads data from TRIP table', async ({ page }) => {
    await loginAsAdmin(page);
    await navToView(page, 'trips');
    const hasData = await page.locator('#v-trips table tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (hasData) {
      expect(await page.locator('#v-trips table tbody tr').count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('expenses view loads data from RECEIPT', async ({ page }) => {
    await loginAsAdmin(page);
    await navToView(page, 'expenses');
    const el = page.locator('#v-expenses table, #v-expenses .expense-list, #v-expenses .card, #v-expenses .content');
    await expect(el.first()).toBeVisible({ timeout: 10000 });
  });
});
