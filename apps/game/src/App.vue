<script setup lang="ts">
import { TresCanvas } from '@tresjs/core';
import { SIM_HZ } from '@mobitenis/sim';
</script>

<template>
  <main class="root">
    <TresCanvas clear-color="#1b2230" window-size>
      <TresPerspectiveCamera :position="[0, 2, 4]" :look-at="[0, 0.76, 0]" />
      <TresAmbientLight :intensity="0.8" />
      <TresMesh :position="[0, 0.76, 0]">
        <TresBoxGeometry :args="[1.525, 0.03, 2.74]" />
        <TresMeshLambertMaterial color="#1f5fa8" />
      </TresMesh>
    </TresCanvas>
    <h1 class="title" data-testid="title">Mobitenis</h1>
    <p class="hint">Simulacija: {{ SIM_HZ }} Hz</p>
  </main>
</template>

<style scoped>
.root {
  position: relative;
  height: 100%;
}
.title {
  position: absolute;
  top: 1rem;
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  pointer-events: none;
}
.hint {
  position: absolute;
  bottom: 1rem;
  left: 0;
  right: 0;
  text-align: center;
  opacity: 0.7;
  pointer-events: none;
}
</style>
