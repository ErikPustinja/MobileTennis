import { expect, test, type Browser, type Page } from '@playwright/test';

const BASE = `/?signal=${encodeURIComponent('ws://127.0.0.1:9000/')}&stun=none`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (page: Page, body: string) => page.evaluate(`(() => { const h = window.__mobitenis; ${body} })()`) as Promise<any>;

async function phoneFor(browser: Browser, game: Page, slot: 0 | 1): Promise<Page> {
  const urls = (await hooks(game, 'return h.host().urls;')) as string[];
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, hasTouch: true });
  const phone = await ctx.newPage();
  await phone.goto(urls[slot]!);
  await expect(phone.getByTestId('conn')).toHaveText('Spojeno');
  return phone;
}

test('one phone plays the bot full screen; pause, return and rematch keep the phone', async ({ page: game, browser }) => {
  await game.goto(`${BASE}&points=1&sets=1`);
  await expect(game.getByTestId('qr-1')).toBeVisible();
  await expect(game.getByTestId('play')).toBeDisabled();
  const phone = await phoneFor(browser, game, 1);
  await phone.evaluate(() => (window as unknown as { __mobitenisController: { markCalibrated: () => void } }).__mobitenisController.markCalibrated());

  await expect(game.getByTestId('play')).toBeEnabled();
  await game.bringToFront();
  await game.getByTestId('play').click();

  // Full screen behind the only player; the other side is the bot.
  await expect(game.getByTestId('hud-1')).toBeVisible();
  await expect(game.getByTestId('hud-0')).toHaveCount(0);
  const views = await game.evaluate(() => (window as unknown as { __mobitenisScene: { views: () => Array<{ side: number; width: number }> } }).__mobitenisScene.views());
  expect(views).toHaveLength(1);
  expect(views[0]!.side).toBe(1);
  expect(await hooks(game, 'return h.sources();')).toEqual(['bot', 'phone']);
  // The bot (player 1) serves by itself.
  await expect.poll(() => hooks(game, 'return h.stats().hits[0];'), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

  // A hidden tab pauses the match and the phone is told; its Serve button resumes.
  await hooks(game, 'h.testHide();');
  await expect.poll(() => hooks(game, 'return h.paused();')).toContain('hidden');
  await expect(game.getByTestId('pause')).toBeVisible();
  await expect(phone.getByTestId('message')).toContainText('Pauza');
  await phone.getByTestId('serve').click();
  await expect.poll(() => hooks(game, 'return h.paused();')).toEqual([]);

  // Finish the match, then rematch without pairing again.
  await hooks(game, 'h.testAwardPoint(0); h.testAwardPoint(0); h.testAwardPoint(0);');
  await expect(game.getByTestId('match-over')).toBeVisible();
  await game.getByTestId('rematch').click();
  await expect(game.getByTestId('match-over')).toBeHidden();
  await expect(game.getByTestId('score-1-own')).toHaveText('0');
  await expect(game.getByTestId('score-1-other')).toHaveText('0');
  expect(await hooks(game, 'return h.sources();')).toEqual(['bot', 'phone']);
  expect(await hooks(game, 'return h.host().slots[1].status;')).toBe('connected');
  await expect(phone.getByTestId('conn')).toHaveText('Spojeno');
});

test('both halves stay readable on a 1080p screen', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByTestId('play-keyboard').click();
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(1500);
  for (const side of [0, 1]) {
    const hud = page.getByTestId(`hud-${side}`);
    const box = (await hud.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(955);
    const size = await page.getByTestId(`score-${side}-own`).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(28);
  }
  await page.screenshot({ path: info.outputPath('split-screen-1080p.png') });
  await page.screenshot({ path: 'test-results/split-screen-1080p.png' });
});

test('after the first visit the game opens offline and says pairing needs the internet', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE);
  await expect(page.getByTestId('play-keyboard')).toBeVisible();
  // Wait until the service worker controls the page and has cached what was loaded.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await new Promise((r) => setTimeout(r, 1000));
  });
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('play-keyboard')).toBeVisible();
  await expect(page.getByTestId('pair-error-0')).toContainText('Nema internetske veze');
  await page.getByTestId('play-keyboard').click();
  await expect(page.getByTestId('hud-0')).toBeVisible();
  await ctx.close();
});
