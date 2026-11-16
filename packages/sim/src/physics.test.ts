import { describe, expect, it } from 'vitest';
import { firstContact, stepBall, type BallEvent, type PaddleSweep } from './ball.ts';
import { BALL, DT, NET, PADDLE, TABLE } from './config.ts';
import type { BallState } from './types.ts';

const ball = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): BallState => ({
  pos: { x, y, z },
  vel: { x: vx, y: vy, z: vz },
  topspin: 0,
  active: true,
});

function fly(b: BallState, seconds: number, sweeps: PaddleSweep[] = []): BallEvent[] {
  const events: BallEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) stepBall(b, DT, (e) => events.push(e), i === 0 ? sweeps : []);
  return events;
}

describe('ball physics', () => {
  it('bounces off the table with the configured restitution', () => {
    const drop = 0.3;
    const b = ball(0, TABLE.height + BALL.radius + drop, -0.5);
    const events: BallEvent[] = [];
    let apex = 0;
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      stepBall(b, DT, (e) => {
        events.push(e);
        if (e.type === 'table') bounced = true;
      });
      if (bounced) apex = Math.max(apex, b.pos.y - TABLE.height - BALL.radius);
      if (events.length >= 2) break;
    }
    expect(events[0]).toEqual({ type: 'table', side: 0 });
    const e2 = BALL.tableRestitution ** 2;
    expect(apex).toBeGreaterThan(drop * e2 * 0.85); // drag takes a little
    expect(apex).toBeLessThan(drop * e2 * 1.001);
  });

  it('stops at the net body and stays on its own side', () => {
    const b = ball(0, TABLE.height + 0.06, -1, 0, 0, 6);
    const events = fly(b, 1.5);
    expect(events.find((e) => e.type === 'net')).toEqual({ type: 'net', cord: false });
    expect(b.pos.z).toBeLessThan(0);
    expect(events.some((e) => e.type === 'table' && e.side === 1)).toBe(false);
  });

  it('rolls over when it clips the net cord', () => {
    const b = ball(0, TABLE.height + NET.height + BALL.radius * 0.5, -0.04, 0, 0, 4);
    const events = fly(b, 1);
    expect(events.find((e) => e.type === 'net')).toEqual({ type: 'net', cord: true });
    expect(b.pos.z).toBeGreaterThan(0);
  });

  it('a long shot misses the table and reaches the floor', () => {
    const r = firstContact(ball(0, 1.0, -1.6, 0, 1.5, 14), DT);
    expect(r.kind).toBe('floor');
    expect(r.pos.z).toBeGreaterThan(TABLE.halfLength);
  });

  it('a wide shot misses the table', () => {
    const r = firstContact(ball(0, 1.0, -1.6, 3, 1.5, 6), DT);
    expect(r.kind).toBe('floor');
  });
});

describe('continuous paddle contact', () => {
  const R = BALL.radius + PADDLE.halfThickness;

  it('catches the ball at the fastest swing even when both step ends are clear of it', () => {
    const speed = PADDLE.swingMaxSpeed; // fastest possible paddle
    const travel = speed * DT; // about 0.18 m in one step
    const b = ball(0, 1, 0.1 - 1.5, 0, 0, -15); // incoming fast ball
    const startZ = b.pos.z - 0.6 * travel;
    const sweep: PaddleSweep = {
      side: 0,
      from: { x: 0, y: 1, z: startZ },
      to: { x: 0, y: 1, z: startZ + travel },
      normal: { x: 0, y: 0, z: 1 },
      onContact: (bl) => {
        bl.vel.z = 10;
      },
    };
    // Discrete check at the step ends would see no overlap at either end.
    const ballEndZ = b.pos.z + b.vel.z * DT;
    expect(b.pos.z - sweep.from.z).toBeGreaterThan(R);
    expect(sweep.to.z - ballEndZ).toBeGreaterThan(R);

    const events: BallEvent[] = [];
    stepBall(b, DT, (e) => events.push(e), [sweep]);
    expect(events).toContainEqual({ type: 'paddle', side: 0 });
    expect(b.vel.z).toBeGreaterThan(0);
  });

  it('touches the ball only once per sweep', () => {
    const b = ball(0, 1, -1.5);
    b.vel.y = 0;
    let contacts = 0;
    const sweep: PaddleSweep = {
      side: 0,
      from: { x: 0, y: 1, z: -1.6 },
      to: { x: 0, y: 1, z: -1.35 },
      normal: { x: 0, y: 0, z: 1 },
      onContact: (bl) => {
        contacts++;
        bl.vel.z = 1; // slower than the paddle, would be hit again without the guard
      },
    };
    stepBall(b, DT, () => {}, [sweep]);
    expect(contacts).toBe(1);
  });

  it('misses a ball outside the blade', () => {
    const b = ball(0.3, 1, -1.5);
    const events: BallEvent[] = [];
    stepBall(b, DT, (e) => events.push(e), [
      {
        side: 0,
        from: { x: 0, y: 1, z: -1.65 },
        to: { x: 0, y: 1, z: -1.4 },
        normal: { x: 0, y: 0, z: 1 },
        onContact: () => {},
      },
    ]);
    expect(events.some((e) => e.type === 'paddle')).toBe(false);
  });
});
