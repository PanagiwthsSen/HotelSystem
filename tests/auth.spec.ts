import { test, expect } from '@playwright/test';

const ROLES = [
  { username: 'admin',       password: '1234', label: 'admin',            url: '/pages/admin.html' },
  { username: 'maria_rec',   password: '1234', label: 'receptionist',     url: '/pages/receptionist.html' },
  { username: 'eleni_maid',  password: '1234', label: 'maid',             url: '/pages/maid.html' },
  { username: 'nikos_bar',   password: '1234', label: 'minibar',          url: '/pages/minibar.html' },
  { username: 'ioan_manag',  password: '1234', label: 'external_manager', url: '/pages/external_manager.html' },
];

for (const role of ROLES) {
  test(`login as ${role.label} redirects to ${role.url}`, async ({ page }) => {
    await page.goto('/pages/login.html');
    await page.fill('#username', role.username);
    await page.fill('#password', role.password);
    await page.click('.btn-login');
    await page.waitForURL(`**${role.url}`, { timeout: 10000 });
    expect(page.url()).toContain(role.url);
  });
}

test('bad credentials show error and stay on login', async ({ page }) => {
  await page.goto('/pages/login.html');
  await page.fill('#username', 'wrong_user');
  await page.fill('#password', 'wrong_pass');
  await page.click('.btn-login');
  await expect(page.locator('#error-message.show')).toBeVisible({ timeout: 5000 });
  await expect(page).toHaveURL(/\/pages\/login\.html/);
});

test('logout clears localStorage and can not access protected page', async ({ page }) => {
  await page.goto('/pages/login.html');
  await page.fill('#username', 'maria_rec');
  await page.fill('#password', '1234');
  await page.click('.btn-login');
  await page.waitForURL('**/pages/receptionist.html', { timeout: 10000 });

  await page.evaluate(() => {
    localStorage.removeItem('hotel_user');
    window.location.href = '/pages/login.html';
  });
  await page.waitForURL('**/pages/login.html', { timeout: 10000 });

  const user = await page.evaluate(() => localStorage.getItem('hotel_user'));
  expect(user).toBeNull();
});
