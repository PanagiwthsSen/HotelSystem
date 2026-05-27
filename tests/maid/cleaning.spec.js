// @ts-check
import { test, expect } from '@playwright/test';
import { setupAuth } from '../helpers.js';

test.describe('Maid — Room Cleaning', () => {

  test('set room in progress then mark done', async ({ page }) => {
    const roomNum = 400;

    // Set a room to dirty
    await page.goto('/pages/maid.html');
    await page.waitForFunction(() => !!window.supabase, { timeout: 10000 });
    await page.evaluate(async (n) => {
      const { error } = await window.supabase.from('ROOM').update({ Status: 'dirty' }).eq('RoomNumber', n);
      if (error) throw error;
    }, roomNum);

    await setupAuth(page, 'maid');
    await page.reload();

    // Navigate to rooms view
    await page.click('.sb-item[data-v="rooms"]');
    await expect(page.locator('#v-rooms')).toBeVisible({ timeout: 10000 });

    // Wait for the room card to appear
    await expect(page.locator(`#rc-${roomNum}`)).toBeVisible({ timeout: 15000 });

    // Click the "Καθαρισμός" button (for dirty rooms)
    const startBtn = page.locator(`#rc-${roomNum} button:has-text("Καθαρισμός")`);
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();

    // After click, card should change to "Σε εξέλιξη" with "Ολοκλήρωση" button
    await expect(page.locator(`#rc-${roomNum}`)).toContainText('Ολοκλήρωση', { timeout: 10000 });

    // Click "Ολοκλήρωση"
    const doneBtn = page.locator(`#rc-${roomNum} button:has-text("Ολοκλήρωση")`);
    await expect(doneBtn).toBeVisible({ timeout: 5000 });
    await doneBtn.click();

    // Click the "Ναι" button on the confirm modal
    await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5000 });
    await page.click('#confirm-yes');

    // After confirmation, the room should no longer appear in the active list
    await expect(page.locator(`#rc-${roomNum}`)).not.toBeVisible({ timeout: 10000 });

    // Verify toast appeared
    await expect(page.locator('#room-toast')).toContainText('Έτοιμο', { timeout: 5000 });

    // Restore room to free
    await page.evaluate(async (n) => {
      const { error } = await window.supabase.from('ROOM').update({ Status: 'free' }).eq('RoomNumber', n);
      if (error) throw error;
    }, roomNum);
  });

});
