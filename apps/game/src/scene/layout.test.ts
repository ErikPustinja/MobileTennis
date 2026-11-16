import { describe, expect, it } from 'vitest';
import { cameraPose, viewLayout } from './layout.ts';

describe('view layout', () => {
  it('splits the screen into two equal halves, player 1 on the left', () => {
    const [a, b] = viewLayout(1920, 1080, [0, 1]);
    expect(a).toEqual({ side: 0, x: 0, y: 0, width: 960, height: 1080 });
    expect(b).toEqual({ side: 1, x: 960, y: 0, width: 960, height: 1080 });
  });

  it('uses the full screen for a single player', () => {
    expect(viewLayout(1920, 1080, [1])).toEqual([{ side: 1, x: 0, y: 0, width: 1920, height: 1080 }]);
  });
});

describe('camera', () => {
  it('sits behind each player on opposite ends', () => {
    expect(cameraPose(0, 0, 1).position[2]).toBeLessThan(-2);
    expect(cameraPose(1, 0, 1).position[2]).toBeGreaterThan(2);
  });

  it('widens the vertical field of view on a narrow half', () => {
    expect(cameraPose(0, 0, 960 / 1080).fov).toBeGreaterThan(cameraPose(0, 0, 1920 / 1080).fov);
  });
});
