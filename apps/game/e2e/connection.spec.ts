import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

const SIGNAL = 'ws://127.0.0.1:9000/';
const trace = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/traces/synthetic/${name}.json`, import.meta.url), 'utf8')) as {
    samples: Array<{ t: number }>;
  };

type Hooks = {
  host: () => { urls: string[]; slots: Array<{ status: string; stats: { droppedStale: number; droppedOrder: number; rtt: number | null } }> };
  paddles: () => Array<{ lateral: number; x: number }>;
  stats: () => { hits: number[]; swings: number[]; points: number };
  paused: () => string[];
  match: () => { rally: { phase: string; server: number }; score: { points: number[] } } | null;
};
const g = <T>(page: Page, fn: (h: Hooks) => T) =>
  page.evaluate((src) => {
    const h = (window as unknown as { __mobitenis: Hooks }).__mobitenis;
    return new Function('h', `return (${src})(h)`)(h) as T;
  }, fn.toString());

type Ctl = {
  injectTrace: (t: unknown) => Promise<number>;
  sendOld: (ms: number) => void;
  sendOutOfOrder: () => void;
  simulateDrop: () => void;
  state: () => { kind: string; slot: number | null };
};
const c = <T>(page: Page, fn: (h: Ctl, arg: unknown) => T, arg?: unknown) =>
  page.evaluate(
    ([src, a]) => {
      const h = (window as unknown as { __mobitenisController: Ctl }).__mobitenisController;
      return new Function('h', 'a', `return (${src})(h, a)`)(h, a) as T;
    },
    [fn.toString(), arg] as const,
  );

async function openPhone(browser: Browser, url: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

test('two phones pair over WebRTC, control their own paddles and survive a drop', async ({ page: game, browser }) => {
  await game.goto(`/?signal=${encodeURIComponent(SIGNAL)}&stun=none`);
  await expect(game.getByTestId('qr-0')).toBeVisible();
  await expect(game.getByTestId('qr-1')).toBeVisible();
  const urls = (await g(game, (h) => h.host().urls)) as string[];
  expect(urls[0]).toContain('/c/#r=');

  const p1 = await openPhone(browser, urls[0]!);
  const p2 = await openPhone(browser, urls[1]!);
  await expect(p1.getByTestId('conn')).toHaveText('Spojeno');
  await expect(p2.getByTestId('conn')).toHaveText('Spojeno');
  await expect(p1.getByTestId('player')).toHaveText('Igrač 1');
  await expect(p2.getByTestId('player')).toHaveText('Igrač 2');
  await expect(game.getByTestId('slot-status-0')).toHaveAttribute('data-status', 'connected');
  await expect(game.getByTestId('slot-status-1')).toHaveAttribute('data-status', 'connected');

  // Phones were opened last; make sure the game tab is the visible one.
  await game.bringToFront();
  await game.getByTestId('play').click();
  await expect(game.getByTestId('hud-0')).toBeVisible();
  expect(await g(game, (h) => h.paused())).toEqual([]);
  await expect(game.getByTestId('hud-1')).toBeVisible();

  // Each phone moves only its own paddle.
  const lat = () => g(game, (h) => h.paddles().map((p) => p.lateral)) as Promise<number[]>;
  const before = await lat();
  await c(p1, (h, t) => h.injectTrace(t), trace('bocni-desno'));
  // Moving the phone to the player's right moves paddle 1 right (positive lateral).
  await expect.poll(async () => (await lat())[0]! - before[0]!).toBeGreaterThan(0.05);
  expect(Math.abs((await lat())[1]! - before[1]!)).toBeLessThan(0.01);

  // The sim follows the paddle target at a limited rate: wait until it has settled.
  let mid = await lat();
  await expect
    .poll(async () => {
      const now = await lat();
      const settled = Math.abs(now[0]! - mid[0]!) < 1e-4;
      mid = now;
      return settled;
    })
    .toBe(true);
  await c(p2, (h, t) => h.injectTrace(t), trace('bocni-lijevo'));
  await expect.poll(async () => (await lat())[1]! - mid[1]!).toBeLessThan(-0.05);
  expect(Math.abs((await lat())[0]! - mid[0]!)).toBeLessThan(0.01);

  // Serve (reliable command) and swing (sensor samples) reach the simulation:
  // the serve starts the toss, and the recognised swing is consumed by a sim step.
  const server = (await g(game, (h) => h.match()!.rally.server)) as number;
  const serverPhone = server === 0 ? p1 : p2;
  await serverPhone.getByTestId('serve').click();
  await expect.poll(() => g(game, (h) => h.match()!.rally.phase)).toBe('toss');
  const swing = trace('forehand-jaki');
  const t0 = swing.samples[0]!.t + 420; // start just before the swing
  await c(serverPhone, (h, t) => h.injectTrace(t), { ...swing, samples: swing.samples.filter((s) => s.t >= t0) });
  await expect.poll(async () => ((await g(game, (h) => h.stats().swings)) as number[])[server]).toBeGreaterThanOrEqual(1);

  // Stale and out-of-order samples are dropped (needs the clock offset from ping first).
  await expect.poll(() => g(game, (h) => h.host().slots[0]!.stats.rtt)).not.toBeNull();
  await c(p1, (h) => {
    h.sendOld(500);
    h.sendOutOfOrder();
  });
  await expect.poll(() => g(game, (h) => h.host().slots[0]!.stats.droppedStale)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => g(game, (h) => h.host().slots[0]!.stats.droppedOrder)).toBeGreaterThanOrEqual(1);

  // A dropped connection pauses the match, shows a return QR and comes back to the same slot.
  const score = await g(game, (h) => h.match()!.score.points.join(':'));
  await c(p1, (h) => h.simulateDrop());
  await expect.poll(() => g(game, (h) => h.paused())).toContain('disconnect-0');
  await expect(game.getByTestId('return-qr-0')).toBeVisible();
  await expect(p1.getByTestId('conn')).toHaveText('Spojeno', { timeout: 10_000 });
  expect((await c(p1, (h) => h.state())).slot).toBe(0);
  await expect.poll(() => g(game, (h) => h.paused())).not.toContain('disconnect-0');
  await expect(game.getByTestId('return-qr-0')).toBeHidden();
  expect(await g(game, (h) => h.match()!.score.points.join(':'))).toBe(score);
});

test('the game explains why pairing failed when the signalling server is unreachable', async ({ page }) => {
  await page.goto(`/?signal=${encodeURIComponent('ws://127.0.0.1:9/')}&stun=none`);
  await expect(page.getByTestId('pair-error-0')).toContainText('Signalizacijski poslužitelj nije dostupan');
  await expect(page.getByTestId('play-keyboard')).toBeEnabled();
});
