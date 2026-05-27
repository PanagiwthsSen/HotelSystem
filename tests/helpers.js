// @ts-check
import { expect } from '@playwright/test';

const USERS = {
  admin:         { id: 1, name: 'Admin',         Role: 'admin' },
  receptionist:  { id: 2, name: 'Maria Rec',     Role: 'receptionist' },
  maid:          { id: 3, name: 'Eleni Maid',    Role: 'maid' },
  manager:       { id: 4, name: 'Ioannis Man',   Role: 'manager' },
  minibar:       { id: 5, name: 'Nikos Bar',     Role: 'minibar' },
  driver:        { id: 6, name: 'Driver',        Role: 'driver' },
  gardener:      { id: 7, name: 'Gardener',      Role: 'gardener' },
};

export function setupAuth(page, role) {
  return page.evaluate((u) => {
    localStorage.setItem('hotel_user', JSON.stringify(u));
  }, USERS[role] || USERS.admin);
}

export function overrideConfirm(page) {
  return page.evaluate(() => {
    window.showConfirm = () => Promise.resolve(true);
  });
}

export function waitForSupabase(page, { method = 'POST', urlPattern, status, timeout = 15000 } = {}) {
  return page.waitForResponse(resp =>
    resp.url().includes(urlPattern) &&
    resp.request().method() === method &&
    (status ? resp.status() === status : resp.ok()),
    { timeout }
  );
}

export function fillDate(page, id, daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return page.fill(id, d.toISOString().split('T')[0]);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function waitForPageReady(page, selector, timeout = 20000) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return el && el.children.length > 0;
  }, selector, { timeout });
}
