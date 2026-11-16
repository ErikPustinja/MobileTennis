import { idleInput, type MatchState, type PlayerInput, type Side } from '@mobitenis/sim';
import type { InputSource } from './source.ts';

export interface KeyMap {
  left: string;
  right: string;
  serve: string;
  forehand: string;
  backhand: string;
  strong: string;
}

/** Physical key codes (layout independent, so QWERTZ works too). */
export const KEYMAPS: Record<Side, KeyMap> = {
  0: { left: 'KeyA', right: 'KeyD', serve: 'KeyW', forehand: 'KeyE', backhand: 'KeyQ', strong: 'ShiftLeft' },
  1: { left: 'KeyJ', right: 'KeyL', serve: 'KeyI', forehand: 'KeyO', backhand: 'KeyU', strong: 'ShiftRight' },
};

/** Human-readable labels for the in-game key help. */
export const KEY_LABELS: Record<Side, Record<keyof KeyMap, string>> = {
  0: { left: 'A', right: 'D', serve: 'W', forehand: 'E', backhand: 'Q', strong: 'lijevi Shift' },
  1: { left: 'J', right: 'L', serve: 'I', forehand: 'O', backhand: 'U', strong: 'desni Shift' },
};

/** Stance offset for forehand (+) and backhand (-), in lateral input units. */
const STANCE = 0.6;
/** Extra lateral offset while a direction key is held. */
const NUDGE = 0.4;
/** Swing direction while a direction key is held. */
const AIM = 0.7;
const NORMAL_STRENGTH = 0.45;
const STRONG_STRENGTH = 0.9;

/**
 * Keyboard controls for one player. Keys are tracked by a shared listener;
 * presses are latched so a tap shorter than one step is never lost.
 */
export class KeyboardInput implements InputSource {
  readonly kind = 'keyboard' as const;
  private stance = STANCE;
  private readonly map: KeyMap;
  private readonly keys: KeyState;
  private readonly side: Side;

  constructor(side: Side, keys: KeyState) {
    this.side = side;
    this.map = KEYMAPS[side];
    this.keys = keys;
  }

  next(_state: MatchState): PlayerInput {
    const k = this.keys;
    const m = this.map;
    const input = idleInput();
    const dir = (k.isDown(m.right) ? 1 : 0) - (k.isDown(m.left) ? 1 : 0);
    const fh = k.consume(m.forehand);
    const bh = k.consume(m.backhand);
    if (fh) this.stance = STANCE;
    else if (bh) this.stance = -STANCE;
    input.lateral = Math.max(-1, Math.min(1, this.stance + dir * NUDGE));
    input.serve = k.consume(m.serve);
    if (fh || bh) {
      input.swing = {
        strength: k.isDown(m.strong) ? STRONG_STRENGTH : NORMAL_STRENGTH,
        direction: dir * AIM,
        stroke: fh ? 'forehand' : 'backhand',
      };
    }
    return input;
  }
}

/** Global key state shared by both keyboard players. */
export class KeyState {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private readonly onDown = (e: KeyboardEvent) => {
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
  };
  private readonly onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private readonly onBlur = () => this.down.clear();

  attach(target: Window = window): () => void {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
    return () => {
      target.removeEventListener('keydown', this.onDown);
      target.removeEventListener('keyup', this.onUp);
      target.removeEventListener('blur', this.onBlur);
    };
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per physical press. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }
}
