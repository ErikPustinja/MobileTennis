import type { Page } from '@playwright/test';

/**
 * Plays both keyboard players from inside the page by dispatching real
 * KeyboardEvents on window, timed from the sim's own prediction. Every
 * fourth incoming ball is deliberately left alone so points are scored.
 */
export async function startAutoplay(page: Page): Promise<void> {
  await page.evaluate(() => {
    type M = {
      time: number;
      rally: { phase: string; server: number };
      ball: { vel: { y: number } };
      prediction: { side: number; time: number } | null;
      players: Array<{ swing: unknown }>;
    };
    const w = window as unknown as { __mobitenis: { match: () => M | null }; __autoplay?: number };
    const keys = [
      { serve: 'KeyW', fh: 'KeyE' },
      { serve: 'KeyI', fh: 'KeyO' },
    ];
    const tap = (code: string) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 40);
    };
    // Natural swing lead for the default strength (backswing / speed).
    const lead = 0.3 / (3 + 19 * 0.45);
    const handled = [-1, -1];
    const incoming = [0, 0];
    let lastServe = -10;
    let tossSwing = -10;
    w.__autoplay = window.setInterval(() => {
      const m = w.__mobitenis.match();
      if (!m) return;
      const r = m.rally;
      if (r.phase === 'serveReady' && m.time - lastServe > 0.8) {
        lastServe = m.time;
        tap(keys[r.server]!.serve);
      }
      if (r.phase === 'toss' && m.ball.vel.y < 0.5 && m.time - tossSwing > 0.5) {
        tossSwing = m.time;
        tap(keys[r.server]!.fh);
      }
      const p = m.prediction;
      if (r.phase === 'inPlay' && p && handled[p.side] !== p.time) {
        if (m.time >= p.time - lead - 0.03) {
          handled[p.side] = p.time;
          incoming[p.side]++;
          if (incoming[p.side]! % 4 !== 0) tap(keys[p.side]!.fh);
        }
      }
    }, 4);
  });
}

export async function stopAutoplay(page: Page): Promise<void> {
  await page.evaluate(() => clearInterval((window as unknown as { __autoplay?: number }).__autoplay));
}

export const stats = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __mobitenis: { stats: () => { hits: number[]; points: number } } }).__mobitenis.stats(),
  );
