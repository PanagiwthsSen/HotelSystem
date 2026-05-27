// @ts-check
import { test, expect } from '@playwright/test';
import { fillDate, uid } from './helpers.js';

const VALID_CREDENTIALS = [
  { username: 'admin',        password: '1234', role: 'admin',        dest: '/pages/admin.html' },
  { username: 'maria_rec',    password: '1234', role: 'receptionist', dest: '/pages/receptionist.html' },
  { username: 'eleni_maid',   password: '1234', role: 'maid',         dest: '/pages/maid.html' },
  { username: 'nikos_bar',    password: '1234', role: 'minibar',      dest: '/pages/minibar.html' },
  { username: 'ioan_manag',   password: '1234', role: 'manager',      dest: '/pages/admin.html' },
  { username: 'kostas_rec',   password: '1234', role: 'receptionist',  dest: '/pages/receptionist.html' },
];

test.describe('Login — Auth Flow', () => {

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/pages/admin.html');
    await page.waitForURL('**/login.html', { timeout: 10000 });
    await expect(page.locator('#login-form')).toBeVisible();
  });

  for (const { username, role, dest } of VALID_CREDENTIALS) {
    test(`valid login "${username}" (${role}) redirects to ${dest}`, async ({ page }) => {
      await page.goto('/pages/login.html');
      await page.fill('#username', username);
      await page.fill('#password', '1234');
      await page.click('button[type="submit"]');
      await page.waitForURL(`**${dest}`, { timeout: 10000 });
      await expect(page).toHaveURL(new RegExp(dest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/pages/login.html');
    await page.fill('#username', 'wrong_user');
    await page.fill('#password', 'wrong_pass');
    await page.click('button[type="submit"]');
    await expect(page.locator('#error-message.show')).toBeVisible({ timeout: 5000 });
  });

  test('already-logged-in session redirects immediately', async ({ page }) => {
    await page.goto('/pages/login.html');
    await page.evaluate(() => {
      localStorage.setItem('hotel_user', JSON.stringify({ id: 1, name: 'Admin', Role: 'admin' }));
    });
    await page.goto('/pages/login.html');
    await page.waitForURL('**/admin.html', { timeout: 10000 });
  });
});
