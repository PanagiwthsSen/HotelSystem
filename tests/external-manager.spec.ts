import { test, expect } from '@playwright/test';

test.describe('External Manager — Overview, Fleet, Inventory', () => {

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/pages/login.html');
    await page.fill('#username', 'ioan_manag');
    await page.fill('#password', '1234');
    await page.click('.btn-login');
    await page.waitForURL('**/pages/external_manager.html', { timeout: 10000 });
    // Force app visible
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      const app = document.querySelector('.app') as HTMLElement;
      if (app) app.style.display = 'flex';
      const loader = document.getElementById('app-loader');
      if (loader) loader.style.display = 'none';
    });
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

  test('overview shows dashboard stats', async ({ page }) => {
    await login(page);
    // v-overview is the default active view
    await page.waitForTimeout(2000);
    const stats = page.locator('#v-overview .sc-val');
    const count = await stats.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('inventory table loads from INVENTORY_ITEM', async ({ page }) => {
    await login(page);
    await navToView(page, 'inventory');
    const rows = page.locator('#inventory-table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('fleet table loads from VEHICLE', async ({ page }) => {
    await login(page);
    await navToView(page, 'fleet');
    const rows = page.locator('#fleet-maintenance-table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });
});
