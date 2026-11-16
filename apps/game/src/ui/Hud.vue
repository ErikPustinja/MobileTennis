<script setup lang="ts">
import { computed } from 'vue';
import type { Side } from '@mobitenis/sim';
import { PLAYER_COLORS, PLAYER_NAMES } from '../colors.ts';
import type { UiState } from '../game/ui-state.ts';
import QrCode from './QrCode.vue';
import { REASON_TEXT } from './texts.ts';

const props = defineProps<{ side: Side; ui: UiState; status: string; controls: string; returnUrl?: string | null }>();
const other = computed<Side>(() => (props.side === 0 ? 1 : 0));
const color = computed(() => PLAYER_COLORS[props.side]);
const myTurnToServe = computed(() => props.ui.server === props.side && props.ui.phase === 'serveReady');
const message = computed(() => {
  const lp = props.ui.lastPoint;
  if (props.ui.phase === 'pointOver' && lp) {
    const who = lp.winner === props.side ? 'Tvoj poen' : 'Poen za protivnika';
    return `${who} · ${REASON_TEXT[lp.reason]}`;
  }
  if (myTurnToServe.value) return 'Tvoj servis';
  return '';
});
</script>

<template>
  <section class="hud" :style="{ '--c': color }" :data-testid="`hud-${side}`">
    <header class="bar">
      <span class="name">{{ PLAYER_NAMES[side] }}</span>
      <span class="score">
        <b :data-testid="`score-${side}-own`">{{ ui.points[side] }}</b>
        <span class="sep">:</span>
        <b :data-testid="`score-${side}-other`">{{ ui.points[other] }}</b>
      </span>
      <span class="sets">Setovi {{ ui.sets[side] }}:{{ ui.sets[other] }}</span>
    </header>
    <p v-if="message" class="message" :data-testid="`message-${side}`">{{ message }}</p>
    <div v-if="returnUrl" class="return" :data-testid="`return-qr-${side}`">
      <QrCode :text="returnUrl" :size="200" />
      <p>Skeniraj za povratak u igru</p>
    </div>
    <footer class="foot">
      <span class="status">{{ status }}</span>
      <span class="controls">{{ controls }}</span>
    </footer>
  </section>
</template>

<style scoped>
.hud {
  position: relative;
  height: 100%;
  box-sizing: border-box;
  border: 4px solid var(--c);
  pointer-events: none;
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.4rem 0.8rem;
  background: color-mix(in srgb, var(--c) 80%, black);
  font-size: clamp(14px, 1.6vw, 26px);
  font-weight: 600;
}
.score {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  font-size: 1.4em;
}
.sep {
  margin: 0 0.3em;
  opacity: 0.7;
}
.sets {
  opacity: 0.9;
}
.message {
  align-self: center;
  margin: 0.8rem 1rem 0;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: rgb(0 0 0 / 55%);
  font-size: clamp(14px, 1.4vw, 24px);
  font-weight: 600;
  text-align: center;
}
.return {
  z-index: 5;
  align-self: center;
  margin-top: 1rem;
  padding: 0.8rem;
  border-radius: 0.8rem;
  background: rgb(0 0 0 / 70%);
  text-align: center;
}
.return p {
  margin: 0.4rem 0 0;
}
.foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0.8rem;
  background: rgb(0 0 0 / 45%);
  font-size: clamp(11px, 0.9vw, 16px);
}
</style>
