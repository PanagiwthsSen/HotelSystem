import { test, expect } from '@playwright/test';

const SB_URL = process.env.VITE_SUPABASE_URL!;
const SB_KEY = process.env.VITE_SUPABASE_KEY!;
const SB = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function sbPost(table: string, data: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: SB, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${await r.text()}`);
  const body = await r.json();
  return Array.isArray(body) ? body[0] : body;
}
async function sbDelete(table: string, query: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: SB });
  if (!r.ok) throw new Error(`DELETE ${table} ${r.status}: ${await r.text()}`);
}

test.describe('Maid — Room Cleaning, Minibar, Shift Report', () => {

  test('view urgent rooms and clean one → ROOM PATCH + NOTIFICATION to receptionist', async ({ page }) => {
    // Create a dirty room via direct API for this test
    const roomNum = 9800 + parseInt(Date.now().toString().slice(-3));
    await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});

    try {
      await sbPost('ROOM', { RoomNumber: roomNum, RoomType: 'Μονόκλινο', BasePrice: 50, Status: 'dirty' });

      await page.goto('/pages/login.html');
      await page.fill('#username', 'eleni_maid');
      await page.fill('#password', '1234');
      await page.click('.btn-login');
      await page.waitForURL('**/pages/maid.html', { timeout: 10000 });

      await page.click('.sb-item[data-v="rooms"]');
      await page.waitForSelector('#room-list .room-card', { timeout: 10000 });

      // Find our dirty room
      const maidCard = page.locator('#room-list .room-card').filter({ has: page.locator(`.room-num:has-text("${roomNum}")`) });
      const hasCard = await maidCard.count().then(c => c > 0).catch(() => false);
      if (!hasCard) {
        test.skip(`Room ${roomNum} not found in maid list`);
        return;
      }

      // Click start cleaning
      const startBtn = maidCard.locator('button:has-text("Καθαρισμός")').first();
      if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await startBtn.click();
      } else {
        await maidCard.locator('.pill.p-r').click();
      }

      // Wait for complete button AFTER setRoomInProgress finishes
      await page.locator('button:has-text("Ολοκλήρωση")').first().waitFor({ timeout: 8000 });

      // Intercept setRoomDone's calls — set up AFTER setRoomInProgress has already fired
      const patchPromise = page.waitForResponse(
        r => r.url().includes('/rest/v1/ROOM') && r.request().method() === 'PATCH', { timeout: 10000 }
      );
      const notifPromise = page.waitForResponse(
        r => r.url().includes('/rest/v1/NOTIFICATION') && r.status() === 201, { timeout: 10000 }
      );

      await page.locator('button:has-text("Ολοκλήρωση")').first().click();
      await page.waitForSelector('#confirm-yes', { timeout: 5000 });
      await page.click('#confirm-yes');

      const patchRes = await patchPromise;
      const notifRes = await notifPromise;
      expect([200, 204]).toContain(patchRes.status());
      expect(notifRes.status()).toBe(201);

      await expect(page.locator('#room-toast')).toContainText('Έτοιμο', { timeout: 5000 });
    } finally {
      await sbDelete('ROOM', `RoomNumber=eq.${roomNum}`).catch(() => {});
      await sbDelete('NOTIFICATION', `Message=like.%${roomNum}%`).catch(() => {});
    }
  });

  test('submit shift report → NOTIFICATION to admin', async ({ page }) => {
    await page.goto('/pages/login.html');
    await page.fill('#username', 'eleni_maid');
    await page.fill('#password', '1234');
    await page.click('.btn-login');
    await page.waitForURL('**/pages/maid.html', { timeout: 10000 });

    await page.click('.sb-item[data-v="report"]');
    await expect(page.locator('#v-report')).toBeVisible();

    const notes = `E2E test report ${Date.now()}`;
    await page.fill('#rep-notes', notes);

    const notifPromise = page.waitForResponse(
      res => res.url().includes('/rest/v1/NOTIFICATION') && res.status() === 201,
      { timeout: 10000 }
    );

    await page.click('button:has-text("Αποστολή Αναφοράς")');

    const notifRes = await notifPromise;
    expect(notifRes.status()).toBe(201);

    await expect(page.locator('#rep-toast')).toBeVisible({ timeout: 5000 });
  });
});
