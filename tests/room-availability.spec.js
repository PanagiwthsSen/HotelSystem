// @ts-check
import { test, expect } from '@playwright/test';
import { fillDate, uid, waitForSupabase } from './helpers.js';

test.describe('Room Availability — DB-backed Check', () => {

  test('sanity: checkRoomTypeCapacity returns valid values', async ({ page }) => {
    const today = new Date();
    const in5 = new Date(today); in5.setDate(today.getDate() + 5);
    const in8 = new Date(today); in8.setDate(today.getDate() + 8);
    const checkinStr = in5.toISOString().split('T')[0];
    const checkoutStr = in8.toISOString().split('T')[0];

    await page.goto('/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140');
    await page.waitForSelector('#f-first', { timeout: 10000 });

    const cap = await page.evaluate(async ({ ci, co }) => {
      return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
    }, { ci: checkinStr, co: checkoutStr });

    expect(cap.total).toBeGreaterThan(0);
    expect(cap.booked).toBeGreaterThanOrEqual(0);
    expect(cap.available).toBeGreaterThanOrEqual(0);
    expect(cap.booked + cap.available).toBe(cap.total);
    expect(typeof cap.isFull).toBe('boolean');
  });

  test('guest booking increases booked count for overlapping dates', async ({ page }) => {
    const suffix = uid();
    const today = new Date();
    const in15 = new Date(today); in15.setDate(today.getDate() + 15);
    const in18 = new Date(today); in18.setDate(today.getDate() + 18);
    const checkinStr = in15.toISOString().split('T')[0];
    const checkoutStr = in18.toISOString().split('T')[0];

    await page.goto(`/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140&checkin=${checkinStr}&checkout=${checkoutStr}`);
    await page.waitForSelector('#f-first', { timeout: 10000 });

    // Get baseline availability
    const before = await page.evaluate(async ({ ci, co }) => {
      return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
    }, { ci: checkinStr, co: checkoutStr });

    // Override confirm modal
    await page.evaluate(() => { window.showConfirm = () => Promise.resolve(true); });

    // Fill Step 1
    await page.fill('#f-first', `Avail${suffix}`);
    await page.fill('#f-last', 'Tester');
    await page.fill('#f-email', `${suffix}@avail-test.com`);
    await page.fill('#f-phone', '+30 6900000099');
    await page.click('button:has-text("Επόμενο")');

    // Fill Step 2
    await page.waitForSelector('#f-card', { timeout: 5000 });
    await page.fill('#f-card', '4111111111111111');
    await fillDate(page, '#f-exp', 365);
    await page.fill('#f-cvv', '123');

    // Submit
    const customerDone = waitForSupabase(page, { method: 'POST', urlPattern: '/rest/v1/CUSTOMER', status: 201 });
    const reservationDone = waitForSupabase(page, { method: 'POST', urlPattern: '/rest/v1/RESERVATION', status: 201 });

    await page.click('button:has-text("Ολοκλήρωση")');

    const custResp = await customerDone;
    expect(custResp.ok()).toBe(true);

    const resResp = await reservationDone;
    expect(resResp.ok()).toBe(true);

    // Verify confirmation
    await expect(page.locator('#form-body')).toContainText('GKH-', { timeout: 10000 });

    // Get availability after booking
    const after = await page.evaluate(async ({ ci, co }) => {
      return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
    }, { ci: checkinStr, co: checkoutStr });

    // Booked count should have increased by exactly 1
    // (this reservation has no RESERVATION_ROOM entries, so it counts as unassigned)
    expect(after.booked - before.booked).toBe(1);
    expect(before.available - after.available).toBe(1);
  });

  test('non-overlapping dates do not affect availability', async ({ page }) => {
    const suffix = uid();
    const today = new Date();
    // Pick 2 date ranges 60 days apart so they definitely don't overlap
    const block1Start = new Date(today); block1Start.setDate(today.getDate() + 10);
    const block1End = new Date(today); block1End.setDate(today.getDate() + 13);
    const block2Start = new Date(today); block2Start.setDate(today.getDate() + 70);
    const block2End = new Date(today); block2End.setDate(today.getDate() + 73);

    const b1ci = block1Start.toISOString().split('T')[0];
    const b1co = block1End.toISOString().split('T')[0];
    const b2ci = block2Start.toISOString().split('T')[0];
    const b2co = block2End.toISOString().split('T')[0];

    // Get baseline for block2
    await page.goto('/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140');
    await page.waitForSelector('#f-first', { timeout: 10000 });

    const b2Before = await page.evaluate(async ({ ci, co }) => {
      return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
    }, { ci: b2ci, co: b2co });

    // Book in block1 (different dates from block2)
    await page.evaluate(() => { window.showConfirm = () => Promise.resolve(true); });

    // Navigate to a new booking page with block1 dates
    await page.goto(`/pages/booking.html?room=%CE%94%CE%AF%CE%BA%CE%BB%CE%B9%CE%BD%CE%BF&price=140&checkin=${b1ci}&checkout=${b1co}`);
    await page.waitForSelector('#f-first', { timeout: 10000 });
    await page.evaluate(() => { window.showConfirm = () => Promise.resolve(true); });

    await page.fill('#f-first', `NonOvl${suffix}`);
    await page.fill('#f-last', 'Tester');
    await page.fill('#f-email', `${suffix}@nonovl-test.com`);
    await page.fill('#f-phone', '+30 6900000099');
    await page.click('button:has-text("Επόμενο")');

    await page.waitForSelector('#f-card', { timeout: 5000 });
    await page.fill('#f-card', '4111111111111111');
    await fillDate(page, '#f-exp', 365);
    await page.fill('#f-cvv', '123');

    const reservationDone = waitForSupabase(page, { method: 'POST', urlPattern: '/rest/v1/RESERVATION', status: 201 });
    await page.click('button:has-text("Ολοκλήρωση")');
    const resResp = await reservationDone;
    expect(resResp.ok()).toBe(true);

    // Check block2 availability again — should be unchanged
    const b2After = await page.evaluate(async ({ ci, co }) => {
      return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
    }, { ci: b2ci, co: b2co });

    expect(b2After.booked).toBe(b2Before.booked);
    expect(b2After.available).toBe(b2Before.available);
  });

  test('multi-room search respects availability on index page', async ({ page }) => {
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const plus4 = new Date(tomorrow); plus4.setDate(tomorrow.getDate() + 3);
    const fmt = d => d.toISOString().split('T')[0];

    await page.goto('/');
    // Wait for the page to finish initial load (room search may have errors)
    await page.waitForTimeout(3000);
    if (errors.length > 0) {
      console.log('Console errors during load:', errors.join('\n'));
    }
    await page.fill('#s-in', fmt(tomorrow));
    await page.fill('#s-out', fmt(plus4));
    await page.selectOption('#s-type', 'dik');
    await page.selectOption('#s-rooms', '2');

    // Click search
    await page.click('.btn-search');
    // Wait for rooms list to have content (loading indicator disappears, cards appear)
    await page.waitForFunction(() => {
      const list = document.getElementById('rooms-list');
      return list && list.children.length > 0 && !list.textContent.includes('Φόρτωση');
    }, { timeout: 20000 });

    // A Δίκλινο card should appear as either available or sold-out
    const cardText = await page.locator('.room-card').first().textContent();

    const fmtDates = { ci: fmt(tomorrow), co: fmt(plus4) };

    if (cardText.includes('Μη διαθέσιμο')) {
      const cap = await page.evaluate(async ({ ci, co }) => {
        return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
      }, fmtDates);
      expect(cap.available).toBeLessThan(2);
    } else {
      const cap = await page.evaluate(async ({ ci, co }) => {
        return await window.checkRoomTypeCapacity('\u0394\u03AF\u03BA\u03BB\u03B9\u03BD\u03BF', ci, co);
      }, fmtDates);
      expect(cap.available).toBeGreaterThanOrEqual(2);
    }
  });
});
