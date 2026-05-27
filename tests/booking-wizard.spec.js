// @ts-check
import { test, expect } from '@playwright/test';
import { fillDate, uid, waitForSupabase } from './helpers.js';

test.describe('Guest Booking Wizard — 3-Step Flow', () => {

  test('blocks booking when capacity check shows no available rooms', async ({ page }) => {
    const suffix = uid();
    const firstName = `Test${suffix}`;
    const lastName = 'Blocked';

    const today = new Date();
    const in5 = new Date(today); in5.setDate(today.getDate() + 5);
    const in8 = new Date(today); in8.setDate(today.getDate() + 8);
    const checkinStr = in5.toISOString().split('T')[0];
    const checkoutStr = in8.toISOString().split('T')[0];

    await page.goto(
      `/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140&checkin=${checkinStr}&checkout=${checkoutStr}`
    );

    await page.waitForSelector('#f-first', { timeout: 10000 });

    await page.fill('#f-first', firstName);
    await page.fill('#f-last', lastName);
    await page.fill('#f-email', `${suffix}@blocked-test.com`);
    await page.fill('#f-phone', '+30 6900000099');
    await page.click('button:has-text("Επόμενο")');

    await page.waitForSelector('#f-card', { timeout: 5000 });

    // Override capacity check to simulate fully booked
    await page.evaluate(() => {
      window.checkRoomTypeCapacity = () => Promise.resolve({ total: 10, booked: 10, available: 0, isFull: true });
    });

    await page.fill('#f-card', '4111111111111111');
    await fillDate(page, '#f-exp', 365);
    await page.fill('#f-cvv', '123');

    await page.click('button:has-text("Ολοκλήρωση")');

    // Verify error toast appeared
    await expect(page.locator('.live-toast.error')).toContainText('κλεισμένα', { timeout: 5000 });

    // Verify still on step 2 (did not advance)
    await expect(page.locator('#f-card')).toBeVisible();
  });

  test('completes full booking and shows confirmation code', async ({ page }) => {
    const suffix = uid();
    const firstName = `Test${suffix}`;
    const lastName = 'GuestWiz';

    // 1. Compute future dates for URL parameters
    const today = new Date();
    const in5 = new Date(today); in5.setDate(today.getDate() + 5);
    const in8 = new Date(today); in8.setDate(today.getDate() + 8);
    const checkinStr = in5.toISOString().split('T')[0];
    const checkoutStr = in8.toISOString().split('T')[0];

    await page.goto(
      `/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140&checkin=${checkinStr}&checkout=${checkoutStr}`
    );

    // 2. Override confirm modal
    await page.evaluate(() => { window.showConfirm = () => Promise.resolve(true); });

    // 3. Wait for step 1 to render
    await page.waitForSelector('#f-first', { timeout: 10000 });

    // 4. Fill Step 1 — customer details
    await page.fill('#f-first', firstName);
    await page.fill('#f-last', lastName);
    await page.fill('#f-email', `${suffix}@guest-test.com`);
    await page.fill('#f-phone', '+30 6900000099');

    // 5. Click Next
    await page.click('button:has-text("Επόμενο")');

    // 6. Fill Step 2 — card details (dummy)
    await page.waitForSelector('#f-card', { timeout: 5000 });
    await page.fill('#f-card', '4111111111111111');
    await fillDate(page, '#f-exp', 365);
    await page.fill('#f-cvv', '123');
    await page.fill('#f-notes', `E2E test booking ${suffix}`);

    // 7. Submit
    const customerDone = waitForSupabase(page, { method: 'POST', urlPattern: '/rest/v1/CUSTOMER', status: 201 });
    const reservationDone = waitForSupabase(page, { method: 'POST', urlPattern: '/rest/v1/RESERVATION', status: 201 });

    await page.click('button:has-text("Ολοκλήρωση")');

    const custResp = await customerDone;
    expect(custResp.ok()).toBe(true);

    const resResp = await reservationDone;
    expect(resResp.ok()).toBe(true);

    // 8. Verify Step 3 — confirmation code
    await expect(page.locator('#form-body')).toContainText('GKH-', { timeout: 10000 });
  });
});
