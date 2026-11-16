<script setup lang="ts">
import { TresCanvas } from '@tresjs/core';
import { computed } from 'vue';
import type { Side } from '@mobitenis/sim';
import { PLAYER_COLORS, PLAYER_NAMES } from '../colors.ts';
import type { GameSession } from '../game/session.ts';
import type { UiState } from '../game/ui-state.ts';
import SceneContent from '../scene/SceneContent.vue';
import Hud from './Hud.vue';

const props = defineProps<{
  session: GameSession;
  ui: UiState;
  sides: Side[];
  status: Record<Side, string>;
  controls: Record<Side, string>;
  returnUrls?: Record<Side, string | null>;
}>();
const emit = defineEmits<{ resume: []; rematch: []; home: [] }>();

const pauseText = computed(() => {
  const r = props.ui.pauseReasons;
  if (r.includes('disconnect-0') || r.includes('disconnect-1')) return 'Mobitel se odspojio – čekam povratak';
  if (r.includes('hidden')) return 'Pauza – kartica je bila u pozadini';
  return 'Pauza';
});
const canResume = computed(
  () => !props.ui.pauseReasons.some((r) => r === 'disconnect-0' || r === 'disconnect-1'),
);
</script>

<template>
  <div class="match" :class="{ single: sides.length === 1 }">
    <TresCanvas class="canvas" clear-color="#1b2230" shadows :antialias="true" :dpr="[1, 1.5]">
      <SceneContent :session="session" :sides="sides" />
    </TresCanvas>
    <div class="huds">
      <Hud
        v-for="side in sides"
        :key="side"
        :side="side"
        :ui="ui"
        :status="status[side]"
        :controls="controls[side]"
        :return-url="returnUrls?.[side] ?? null"
      />
    </div>
    <div v-if="ui.paused" class="overlay" :class="{ banner: !canResume }" data-testid="pause">
      <div class="panel">
        <h2>{{ pauseText }}</h2>
        <slot name="pause" />
        <button v-if="canResume" type="button" data-testid="resume" @click="emit('resume')">Nastavi (razmak)</button>
      </div>
    </div>
    <div v-else-if="ui.winner !== null" class="overlay" data-testid="match-over">
      <div class="panel">
        <h2 :style="{ color: PLAYER_COLORS[ui.winner] }">Pobjednik: {{ PLAYER_NAMES[ui.winner] }}</h2>
        <p class="sets">
          <span v-for="(set, i) in ui.history" :key="i">{{ set[0] }}:{{ set[1] }}</span>
        </p>
        <div class="buttons">
          <button type="button" data-testid="rematch" @click="emit('rematch')">Revanš</button>
          <button type="button" class="secondary" @click="emit('home')">Početni zaslon</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.match {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.canvas {
  position: absolute !important;
  inset: 0;
}
.huds {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  pointer-events: none;
}
.single .huds {
  grid-template-columns: 1fr;
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(5 8 14 / 55%);
}
.overlay.banner {
  inset: auto 0 3rem 0;
  background: none;
}
.panel {
  min-width: 22rem;
  padding: 1.5rem 2rem;
  border-radius: 1rem;
  background: #161c27;
  text-align: center;
  box-shadow: 0 1rem 3rem rgb(0 0 0 / 50%);
}
.sets {
  display: flex;
  gap: 1rem;
  justify-content: center;
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
}
.buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}
button {
  padding: 0.7rem 1.6rem;
  border: 0;
  border-radius: 0.6rem;
  background: #3ad07a;
  color: #08130c;
  font: inherit;
  font-weight: 700;
  font-size: 1.1rem;
  cursor: pointer;
}
button.secondary {
  background: #2d3646;
  color: #f2f4f8;
}
</style>
