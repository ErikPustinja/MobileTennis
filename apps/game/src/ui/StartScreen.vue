<script setup lang="ts">
import type { Side } from '@mobitenis/sim';
import { PLAYER_COLORS, PLAYER_NAMES } from '../colors.ts';
import KeyHelp from './KeyHelp.vue';

defineProps<{ canPlay: boolean }>();
const emit = defineEmits<{ play: []; keyboard: [] }>();
const sides: Side[] = [0, 1];
</script>

<template>
  <div class="start">
    <h1>Mobitenis</h1>
    <div class="slots">
      <section v-for="side in sides" :key="side" class="slot" :style="{ '--c': PLAYER_COLORS[side] }" :data-testid="`slot-${side}`">
        <h2>{{ PLAYER_NAMES[side] }}</h2>
        <slot :name="`slot-${side}`">
          <div class="qr-placeholder">QR</div>
          <p class="status">Čeka mobitel</p>
        </slot>
      </section>
    </div>
    <div class="actions">
      <button type="button" data-testid="play" :disabled="!canPlay" @click="emit('play')">Igraj</button>
      <button type="button" class="secondary" data-testid="play-keyboard" @click="emit('keyboard')">Igraj tipkovnicom</button>
    </div>
    <p v-if="!canPlay" class="hint">Gumb Igraj postaje aktivan kad se spoji barem jedan mobitel.</p>
    <slot name="extra" />
    <KeyHelp :sides="sides" />
  </div>
</template>

<style scoped>
.start {
  min-height: 100%;
  box-sizing: border-box;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}
h1 {
  margin: 0;
  font-size: 2.6rem;
  letter-spacing: 0.04em;
}
.slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  width: min(1100px, 100%);
}
.slot {
  border: 4px solid var(--c);
  border-radius: 1rem;
  padding: 1rem;
  background: color-mix(in srgb, var(--c) 10%, #10141c);
}
.slot h2 {
  margin: 0 0 0.6rem;
  color: var(--c);
}
.qr-placeholder {
  display: grid;
  place-items: center;
  width: 220px;
  height: 220px;
  margin: 0 auto;
  border: 2px dashed var(--c);
  border-radius: 0.6rem;
  opacity: 0.5;
}
.status {
  margin: 0.6rem 0 0;
}
.actions {
  display: flex;
  gap: 1rem;
}
button {
  padding: 0.8rem 2rem;
  border: 0;
  border-radius: 0.7rem;
  background: #3ad07a;
  color: #08130c;
  font: inherit;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  background: #2a3a30;
  color: #6f8577;
  cursor: not-allowed;
}
button.secondary {
  background: #2d3646;
  color: #f2f4f8;
}
.hint {
  margin: 0;
  opacity: 0.7;
}
</style>
