import { expect, test } from '@playwright/test';
import { startAutoplay, stats, stopAutoplay } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-keyboard').click();
  await expect(page.getByTestId('hud-0')).toBeVisible();
  await expect(page.getByTestId('hud-1')).toBeVisible();
});

test('keyboard match: serve, rally and score in both halves', async ({ page }, info) => {
  await startAutoplay(page);
  await expect
    .poll(async () => {
      const s = await stats(page);
      return s.hits[0]! >= 3 && s.hits[1]! >= 3 && s.points >= 2;
    }, { timeout: 75_000, intervals: [500] })
    .toBe(true);
  await stopAutoplay(page);

  const s = await stats(page);
  // Each half shows the same score from its own perspective.
  const own0 = Number(await page.getByTestId('score-0-own').textContent());
  const other0 = Number(await page.getByTestId('score-0-other').textContent());
  const own1 = Number(await page.getByTestId('score-1-own').textContent());
  const other1 = Number(await page.getByTestId('score-1-other').textContent());
  expect(own0 + other0).toBeGreaterThan(0);
  expect(own0).toBe(other1);
  expect(other0).toBe(own1);
  expect(own0 + other0).toBeLessThanOrEqual(s.points);

  await page.screenshot({ path: info.outputPath('split-screen.png') });
  await page.screenshot({ path: 'test-results/split-screen.png' });
});

test('the same sideways key moves the racket right in each player\'s own view', async ({ page }) => {
  const x = (side: 0 | 1) =>
    page.evaluate(
      (s) => (window as unknown as { __mobitenisScene: { paddleScreenX: (s: number) => number } }).__mobitenisScene.paddleScreenX(s),
      side,
    );
  // Backhand stance first so there is room to move right.
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyU');
  await page.waitForTimeout(1500);

  const p1Before = await x(0);
  await page.keyboard.down('KeyD'); // player 1 "right"
  await page.waitForTimeout(500);
  const p1After = await x(0);
  await page.keyboard.up('KeyD');

  const p2Before = await x(1);
  await page.keyboard.down('KeyL'); // player 2 "right"
  await page.waitForTimeout(500);
  const p2After = await x(1);
  await page.keyboard.up('KeyL');

  expect(p1After - p1Before).toBeGreaterThan(0.02);
  expect(p2After - p2Before).toBeGreaterThan(0.02);
});
