<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Bot, type MatchConfig, type MatchEvent, type Side } from '@mobitenis/sim';
import type { PhoneState, SensorTrace, Slot } from '@mobitenis/protocol';
import { GameSession } from './game/session.ts';
import { bindUi, createUiState } from './game/ui-state.ts';
import { KEY_LABELS, KeyboardInput, KeyState } from './input/keyboard.ts';
import type { InputSource } from './input/source.ts';
import { PhoneHub, hubConfigFromLocation } from './net/phones.ts';
import Diagnostics from './ui/Diagnostics.vue';
import MatchView from './ui/MatchView.vue';
import SlotPanel from './ui/SlotPanel.vue';
import StartScreen from './ui/StartScreen.vue';

const keys = new KeyState();
const ui = createUiState();
const session = shallowRef<GameSession | null>(null);
const sides = shallowRef<Side[]>([0, 1]);
/** Which sides are driven by a phone in the current match. */
const phoneSides = shallowRef<Side[]>([]);
const showDiag = ref(false);
const fps = ref(0);
let unbind: (() => void) | null = null;
const stats = { hits: [0, 0] as [number, number], points: 0 };

const hub = new PhoneHub(hubConfigFromLocation());

/** Optional shorter matches: `?points=5&sets=1` (points per set, sets to win). */
function matchConfigFromLocation(): Partial<MatchConfig> {
  const q = new URLSearchParams(location.search);
  const cfg: Partial<MatchConfig> = {};
  const points = Number(q.get('points'));
  const sets = Number(q.get('sets'));
  if (Number.isInteger(points) && points >= 1 && points <= 21) cfg.pointsToWinSet = points;
  if (Number.isInteger(sets) && sets >= 1 && sets <= 5) cfg.setsToWin = sets;
  return cfg;
}
const matchConfig = matchConfigFromLocation();
const anyPhone = computed(() => hub.view.slots.some((s) => s.status === 'connected'));

const keyHelp = (side: Side) =>
  `${KEY_LABELS[side].serve} servis · ${KEY_LABELS[side].left}/${KEY_LABELS[side].right} pomak · ${KEY_LABELS[side].forehand} forehand · ${KEY_LABELS[side].backhand} backhand · ${KEY_LABELS[side].strong} jako`;

const status = computed<Record<Side, string>>(() => {
  const s = session.value;
  const text = (side: Side) => {
    const kind = s?.sources[side].kind;
    if (kind === 'phone') return hub.view.slots[side].status === 'connected' ? 'Mobitel spojen' : 'Mobitel odspojen';
    if (kind === 'bot') return 'Bot';
    return 'Tipkovnica';
  };
  return { 0: text(0), 1: text(1) };
});
const controls = computed<Record<Side, string>>(() => {
  const s = session.value;
  const text = (side: Side) =>
    s?.sources[side].kind === 'phone' ? 'Servis: gumb na mobitelu · zamah: zamahni mobitelom' : keyHelp(side);
  return { 0: text(0), 1: text(1) };
});
const returnUrls = computed<Record<Side, string | null>>(() => {
  const url = (side: Side) =>
    phoneSides.value.includes(side) && hub.view.slots[side].status !== 'connected' ? hub.view.slots[side].url : null;
  return { 0: url(0), 1: url(1) };
});

function startMatch(sources: [InputSource, InputSource], visible: Side[], phones: Side[]): void {
  stopMatch();
  const s = new GameSession(sources, undefined, matchConfig);
  sides.value = visible;
  phoneSides.value = phones;
  for (const side of [0, 1] as const) hub.inputs[side].setActive(phones.includes(side));
  session.value = s;
  attachSession(s);
  pushPhoneState();
}

function startKeyboardMatch(): void {
  startMatch([new KeyboardInput(0, keys), new KeyboardInput(1, keys)], [0, 1], []);
}

/** Two phones: split screen. One phone: that player against the bot, full screen. */
function startPhoneMatch(): void {
  const connected = ([0, 1] as const).filter((s) => hub.connected(s));
  if (connected.length === 0) return;
  if (connected.length === 2) {
    startMatch([hub.inputs[0], hub.inputs[1]], [0, 1], [0, 1]);
    return;
  }
  const me = connected[0]!;
  const sources: [InputSource, InputSource] =
    me === 0
      ? [hub.inputs[0], botSource(1)]
      : [botSource(0), hub.inputs[1]];
  startMatch(sources, [me], [me]);
}

function botSource(side: Side): InputSource {
  const bot = new Bot(side, (Math.random() * 2 ** 31) >>> 0);
  return { kind: 'bot', next: (state) => bot.next(state) };
}

function attachSession(s: GameSession): void {
  stats.hits = [0, 0];
  stats.points = 0;
  const offUi = bindUi(ui, s);
  const offEvents = s.onChange((events) => onMatchEvents(events));
  unbind = () => {
    offUi();
    offEvents();
  };
}

function onMatchEvents(events: MatchEvent[]): void {
  let changed = events.length === 0; // pause/resume and rematch emit no events
  for (const e of events) {
    if (e.type === 'hit') {
      stats.hits[e.side]++;
      if (phoneSides.value.includes(e.side)) hub.send(e.side, { t: 'hit' });
    }
    if (e.type === 'point') stats.points++;
    if (e.type === 'point' || e.type === 'serveReady' || e.type === 'match' || e.type === 'toss' || e.type === 'let') changed = true;
  }
  if (changed) pushPhoneState();
}

function phoneState(slot: Slot): PhoneState {
  const s = session.value;
  if (!s) return { paused: false, phase: 'lobby', myServe: false, score: [0, 0] };
  const m = s.match;
  const other = slot === 0 ? 1 : 0;
  return {
    paused: s.paused,
    phase: m.rally.phase,
    myServe: m.rally.server === slot,
    score: [m.score.points[slot], m.score.points[other]],
  };
}

function pushPhoneState(): void {
  for (const slot of [0, 1] as const) hub.sendState(slot, phoneState(slot));
}

function stopMatch(): void {
  unbind?.();
  unbind = null;
  session.value = null;
  phoneSides.value = [];
  for (const side of [0, 1] as const) hub.inputs[side].setActive(false);
  pushPhoneState();
}

function resume(): void {
  session.value?.setPause('hidden', false);
  session.value?.setPause('manual', false);
}

hub.onServe = (slot) => {
  const s = session.value;
  if (!s || !phoneSides.value.includes(slot)) return;
  // The phone has no space bar: Serve also resumes a pause.
  if (s.pauseReasons().some((r) => r === 'hidden' || r === 'manual')) resume();
  else hub.inputs[slot].queueServe();
};

hub.onStatus = (slot, st) => {
  const s = session.value;
  if (s && phoneSides.value.includes(slot)) s.setPause(slot === 0 ? 'disconnect-0' : 'disconnect-1', st !== 'connected');
  if (st === 'connected') hub.sendState(slot, phoneState(slot));
};

hub.onTrace = (_slot, trace: SensorTrace) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`${JSON.stringify(trace)}\n`], { type: 'application/json' }));
  a.download = `${trace.label}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

function onVisibility(): void {
  if (document.hidden) session.value?.setPause('hidden', true);
}

function onKey(e: KeyboardEvent): void {
  if (e.code === 'F2' || e.code === 'Backquote') {
    e.preventDefault();
    showDiag.value = !showDiag.value;
    return;
  }
  const s = session.value;
  if (!s) return;
  if (e.code === 'Escape') s.setPause('manual', !s.pauseReasons().includes('manual'));
  if (e.code === 'Space' && s.paused) {
    e.preventDefault();
    resume();
  }
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

let frames = 0;
let fpsStart = performance.now();
let raf = 0;
function countFrame(): void {
  frames++;
  const now = performance.now();
  if (now - fpsStart >= 1000) {
    fps.value = (frames * 1000) / (now - fpsStart);
    frames = 0;
    fpsStart = now;
  }
  raf = requestAnimationFrame(countFrame);
}

let detachKeys: (() => void) | null = null;
onMounted(() => {
  detachKeys = keys.attach(window);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(countFrame);
  // Read-only hooks for end-to-end tests.
  (window as unknown as { __mobitenis: unknown }).__mobitenis = {
    match: () => session.value?.match ?? null,
    ui: () => ({ ...ui }),
    stats: () => ({ hits: [...stats.hits], swings: hub.inputs.map((i) => i.swings), points: stats.points }),
    host: () => ({
      room: hub.host.room,
      state: hub.host.state,
      slots: hub.host.core.slots.map((s) => ({ status: s.status, stats: { ...s.stats } })),
      urls: [hub.urlFor(0), hub.urlFor(1)],
    }),
    paused: () => session.value?.pauseReasons() ?? [],
    paddles: () => session.value?.match.players.map((p) => ({ lateral: p.lateral, x: p.paddle.pos.x })) ?? [],
    sources: () => session.value?.sources.map((s) => s.kind) ?? [],
    testAwardPoint: (side: Side) => session.value?.debugAwardPoint(side),
    testHide: () => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    },
  };
});
onBeforeUnmount(() => {
  detachKeys?.();
  cancelAnimationFrame(raf);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('keydown', onKey);
  hub.host.stop();
});
</script>

<template>
  <button type="button" class="corner fullscreen" :class="{ low: session }" title="Preko cijelog zaslona" @click="toggleFullscreen">⛶</button>
  <button type="button" class="corner diag-btn" :class="{ low: session }" title="Dijagnostika (F2)" data-testid="diag-toggle" @click="showDiag = !showDiag">
    ⚙
  </button>
  <MatchView
    v-if="session"
    :session="session"
    :ui="ui"
    :sides="sides"
    :status="status"
    :controls="controls"
    :return-urls="returnUrls"
    @resume="resume"
    @rematch="session.rematch()"
    @home="stopMatch"
  />
  <StartScreen v-else :can-play="anyPhone" @play="startPhoneMatch" @keyboard="startKeyboardMatch">
    <template v-for="slot in [0, 1] as const" :key="slot" #[`slot-${slot}`]>
      <SlotPanel
        :index="slot"
        :view="hub.view.slots[slot]"
        :room="hub.view.room"
        :ready="hub.view.state === 'ready' || hub.view.slots[slot].status !== 'free'"
        :error="hub.view.error"
      />
    </template>
  </StartScreen>
  <Diagnostics v-if="showDiag" :hub="hub" :fps="fps" @close="showDiag = false" />
</template>

<style scoped>
.corner {
  position: fixed;
  top: 0.4rem;
  z-index: 10;
  width: 2.4rem;
  height: 2.4rem;
  border: 0;
  border-radius: 0.5rem;
  background: rgb(0 0 0 / 45%);
  color: #fff;
  font-size: 1.3rem;
  cursor: pointer;
}
.fullscreen {
  left: calc(50% - 2.6rem);
}
/* During a match keep the buttons off the score bars. */
.corner.low {
  top: auto;
  bottom: 2.4rem;
}
.diag-btn {
  left: calc(50% + 0.2rem);
}
</style>
