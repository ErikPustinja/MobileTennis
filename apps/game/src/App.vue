<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { Side } from '@mobitenis/sim';
import { GameSession } from './game/session.ts';
import { bindUi, createUiState } from './game/ui-state.ts';
import { KEY_LABELS, KeyboardInput, KeyState } from './input/keyboard.ts';
import MatchView from './ui/MatchView.vue';
import StartScreen from './ui/StartScreen.vue';

const keys = new KeyState();
const ui = createUiState();
const session = shallowRef<GameSession | null>(null);
const sides = shallowRef<Side[]>([0, 1]);
let unbind: (() => void) | null = null;
const stats = { hits: [0, 0] as [number, number], points: 0 };

const status = computed<Record<Side, string>>(() => ({ 0: 'Tipkovnica', 1: 'Tipkovnica' }));
const controls = computed<Record<Side, string>>(() => ({
  0: `${KEY_LABELS[0].serve} servis · ${KEY_LABELS[0].left}/${KEY_LABELS[0].right} pomak · ${KEY_LABELS[0].forehand} forehand · ${KEY_LABELS[0].backhand} backhand · ${KEY_LABELS[0].strong} jako`,
  1: `${KEY_LABELS[1].serve} servis · ${KEY_LABELS[1].left}/${KEY_LABELS[1].right} pomak · ${KEY_LABELS[1].forehand} forehand · ${KEY_LABELS[1].backhand} backhand · ${KEY_LABELS[1].strong} jako`,
}));

function startKeyboardMatch(): void {
  stopMatch();
  const s = new GameSession([new KeyboardInput(0, keys), new KeyboardInput(1, keys)]);
  sides.value = [0, 1];
  session.value = s;
  attachSession(s);
}

function attachSession(s: GameSession): void {
  stats.hits = [0, 0];
  stats.points = 0;
  const offUi = bindUi(ui, s);
  const offStats = s.onChange((events) => {
    for (const e of events) {
      if (e.type === 'hit') stats.hits[e.side]++;
      if (e.type === 'point') stats.points++;
    }
  });
  unbind = () => {
    offUi();
    offStats();
  };
}

function stopMatch(): void {
  unbind?.();
  unbind = null;
  session.value = null;
}

function resume(): void {
  session.value?.setPause('hidden', false);
  session.value?.setPause('manual', false);
}

function onVisibility(): void {
  if (document.hidden) session.value?.setPause('hidden', true);
}

function onKey(e: KeyboardEvent): void {
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

let detachKeys: (() => void) | null = null;
onMounted(() => {
  detachKeys = keys.attach(window);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey);
  (window as unknown as { __mobitenis: unknown }).__mobitenis = {
    match: () => session.value?.match ?? null,
    ui: () => ({ ...ui }),
    stats: () => ({ hits: [...stats.hits], points: stats.points }),
  };
});
onBeforeUnmount(() => {
  detachKeys?.();
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <button type="button" class="fullscreen" title="Preko cijelog zaslona" @click="toggleFullscreen">⛶</button>
  <MatchView
    v-if="session"
    :session="session"
    :ui="ui"
    :sides="sides"
    :status="status"
    :controls="controls"
    @resume="resume"
    @rematch="session.rematch()"
    @home="stopMatch"
  />
  <StartScreen v-else :can-play="false" @keyboard="startKeyboardMatch" />
</template>

<style scoped>
.fullscreen {
  position: fixed;
  top: 0.4rem;
  left: 50%;
  transform: translateX(-50%);
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
</style>
