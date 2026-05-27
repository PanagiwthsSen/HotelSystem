// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth, overrideConfirm, uid } from './helpers.js';

test.describe('Receptionist — Check-In Workflow', () => {

  test('creates a reservation, then checks in to assign a room', async ({ page }) => {
    const suffix = uid();

    await page.goto('/pages/receptionist.html');
    await setupAuth(page, 'receptionist');
    await overrideConfirm(page);
    await page.reload();

    // Wait for dropdown population
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Navigate to New Reservation
    await page.click('.sb-item[data-v="new-booking"]');
    await expect(page.locator('#v-new-booking')).toBeVisible();

    // Set future dates
    const today = new Date();
    const in30 = new Date(today); in30.setDate(today.getDate() + 30);
    const in33 = new Date(today); in33.setDate(today.getDate() + 33);
    const fmt = d => d.toISOString().split('T')[0];
    await page.fill('#nb-in', fmt(in30));
    await page.fill('#nb-out', fmt(in33));

    // Search rooms
    await page.click('button:has-text("Αναζήτηση Δωματίων")');
    await page.waitForSelector('#avail-rooms .room-opt', { timeout: 10000 });

    // Fill customer
    await page.fill('#nb-first', `Checkin${suffix}`);
    await page.fill('#nb-last', 'TestUser');
    await page.fill('#nb-phone', '+30 6900000002');
    await page.fill('#nb-email', `checkin-${suffix}@test.com`);

    // Submit booking
    const custDone = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/CUSTOMER') && resp.request().method() === 'POST' && resp.status() === 201
    );
    const rpcDone = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/rpc/book_room_atomic') && resp.request().method() === 'POST' && resp.ok()
    );
    await page.click('button:has-text("Καταχώρηση")');
    await custDone;
    await rpcDone;

    // Navigate to All Bookings
    await page.click('.sb-item[data-v="bookings"]');
    await page.waitForSelector('#bk-body tr', { timeout: 10000 });

    // Click the "Check-in" button for our reservation
    const checkinBtn = page.locator(`#bk-body button:has-text("Check-in")`).first();
    // If check-in isn't visible (arrivals view), navigate to arrivals
    if (!(await checkinBtn.isVisible().catch(() => false))) {
      await page.click('.sb-item[data-v="arrivals"]');
      await page.waitForTimeout(2000);
    }

    // Actually the booking we created has future check-in date so it won't appear in today's arrivals.
    // Instead use page.evaluate to directly check-in via Supabase for testing the check-in flow.
    // Set the reservation's CheckInDate to today to make it appear in arrivals
    await page.evaluate(async (suf) => {
      const sb = window.supabase;
      const { data: res } = await sb.from('RESERVATION')
        .select('ReservationID, CUSTOMER(FirstName, LastName)')
        .not('Status', 'in', '("Cancelled","CheckedOut","CheckedIn")')
        .order('ReservationID', { ascending: false })
        .limit(1)
        .single();
      if (res) {
        // Patch check-in date to today so it shows in arrivals
        await sb.from('RESERVATION').update({ CheckInDate: new Date().toISOString().split('T')[0] }).eq('ReservationID', res.ReservationID);
      }
    }, suffix);

    // Reload to pick up the change
    await page.reload();
    await page.waitForFunction(() => {
      const sel = document.getElementById('nb-rtype');
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Navigate to arrivals
    await page.click('.sb-item[data-v="arrivals"]');
    await expect(page.locator('#v-arrivals')).toBeVisible();

    // There should now be at least one arrival row
    await page.waitForSelector('#v-arrivals table tbody tr', { timeout: 10000 });

    // Click first "Check-in" button
    const arrivalBtn = page.locator('#v-arrivals table tbody tr .btn-dark:has-text("Check-in")').first();
    await expect(arrivalBtn).toBeVisible({ timeout: 5000 });
    await arrivalBtn.click();

    // Modal should open
    await expect(page.locator('#checkin-modal')).toBeVisible({ timeout: 5000 });

    // Select a room from dropdown
    const roomSelect = page.locator('#modal-room-select');
    if (await roomSelect.isVisible()) {
      const options = roomSelect.locator('option');
      const count = await options.count();
      if (count > 1) {
        await roomSelect.selectOption({ index: 1 });
      }
    }

    // Confirm check-in
    const patchReservation = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/RESERVATION') && resp.request().method() === 'PATCH' && resp.ok()
    );
    const patchRoom = page.waitForResponse(resp =>
      resp.url().includes('/rest/v1/ROOM') && resp.request().method() === 'PATCH' && resp.ok()
    );

    await page.click('#checkin-modal .btn-dark:has-text("Επιβεβαίωση")');

    await patchReservation;
    await patchRoom;

    // Modal should close
    await expect(page.locator('#checkin-modal')).not.toBeVisible({ timeout: 5000 });

    // Arrivals table should now show "C/I OK" badge
    await expect(page.locator('#v-arrivals table tbody tr .pill.p-g:has-text("Ολοκλ.")').first()).toBeVisible({ timeout: 5000 });
  });
});
