// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from '../helpers.js';

test.describe('Admin — Complaints', () => {

  test('resolve a complaint', async ({ page }) => {
    const suffix = uid();
    await page.goto('/pages/admin.html');
    await setupAuth(page, 'admin');
    await overrideConfirm(page);
    await page.reload();

    // Wait for the complaints section to load
    await page.waitForSelector('#complaints-body', { timeout: 20000 });

    // Check if there are any complaints; if not, create one via evaluate
    const hasComplaints = await page.evaluate(async (suf) => {
      const sb = window.supabase;
      const { data: existing } = await sb.from('COMPLAINT').select('ComplaintID').limit(1);
      if (existing && existing.length > 0) return true;
      // Create a test complaint
      const { data: cust } = await sb.from('CUSTOMER').select('CustomerID').limit(1).single();
      const { data: emp } = await sb.from('EMPLOYEE').select('EmpID').limit(1).single();
      if (cust && emp) {
        await sb.from('COMPLAINT').insert([{
          EmpID: emp.EmpID, CustomerID: cust.CustomerID,
          Description: `E2E test complaint ${suf}`, Status: 'pending'
        }]);
        return true;
      }
      return false;
    }, suffix);
    expect(hasComplaints).toBe(true);

    await page.reload();
    await page.waitForSelector('#complaints-body tr', { timeout: 20000 });

    // Click resolve on the first complaint
    const resolveBtn = page.locator('#complaints-body .btn-dark:has-text("Επίλυση")').first();
    await expect(resolveBtn).toBeVisible({ timeout: 5000 });
    await resolveBtn.click();

    const patchComplaint = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/COMPLAINT') && resp.request().method() === 'PATCH' && resp.ok()
    );

    // Confirm in modal
    await page.click('.btn-dark:has-text("Ναι")');
    await patchComplaint;

    // Toast should confirm resolution
    await expect(page.locator('#toast-container')).toContainText('Επίλυση', { timeout: 5000 });
  });
});
