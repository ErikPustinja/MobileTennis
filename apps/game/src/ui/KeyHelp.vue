<script setup lang="ts">
import type { Side } from '@mobitenis/sim';
import { KEY_LABELS } from '../input/keyboard.ts';
import { PLAYER_COLORS, PLAYER_NAMES } from '../colors.ts';

defineProps<{ sides: Side[] }>();
</script>

<template>
  <div class="keys">
    <div v-for="side in sides" :key="side" class="col" :style="{ borderColor: PLAYER_COLORS[side] }">
      <h3>{{ PLAYER_NAMES[side] }} – tipkovnica</h3>
      <ul>
        <li><kbd>{{ KEY_LABELS[side].serve }}</kbd> servis</li>
        <li><kbd>{{ KEY_LABELS[side].left }}</kbd> / <kbd>{{ KEY_LABELS[side].right }}</kbd> bočni pomak (i smjer udarca)</li>
        <li><kbd>{{ KEY_LABELS[side].forehand }}</kbd> forehand</li>
        <li><kbd>{{ KEY_LABELS[side].backhand }}</kbd> backhand</li>
        <li>drži <kbd>{{ KEY_LABELS[side].strong }}</kbd> za jak udarac</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.keys {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  flex-wrap: wrap;
}
.col {
  border-left: 4px solid;
  padding: 0.2rem 1rem;
  text-align: left;
}
h3 {
  margin: 0.2rem 0;
  font-size: 1rem;
}
ul {
  margin: 0;
  padding-left: 1rem;
  line-height: 1.7;
}
kbd {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 0.35em;
  border: 1px solid #8a93a3;
  border-bottom-width: 3px;
  border-radius: 4px;
  background: #1f2633;
  text-align: center;
  font-family: inherit;
}
</style>
