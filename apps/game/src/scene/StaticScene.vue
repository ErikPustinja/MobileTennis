<script setup lang="ts">
import { NET, TABLE } from '@mobitenis/sim';

// Everything that never moves: hall, table, net, light.
const T = TABLE;
const top = T.height;
const LINE = 0.02;
const legX = T.halfWidth - 0.12;
const legZ = T.halfLength - 0.25;
const legs: [number, number][] = [
  [legX, legZ],
  [-legX, legZ],
  [legX, -legZ],
  [-legX, -legZ],
];
const netWidth = NET.halfWidth * 2;
</script>

<template>
  <TresHemisphereLight :args="['#dfe8ff', '#3a3226', 1.1]" />
  <TresDirectionalLight
    :position="[1.2, 6, 1.5]"
    :intensity="2.2"
    cast-shadow
    :shadow-mapSize-width="1024"
    :shadow-mapSize-height="1024"
    :shadow-camera-left="-2.2"
    :shadow-camera-right="2.2"
    :shadow-camera-top="3"
    :shadow-camera-bottom="-3"
    :shadow-camera-near="1"
    :shadow-camera-far="12"
    :shadow-bias="-0.0005"
  />

  <!-- Hall floor and court mat -->
  <TresMesh :rotation="[-Math.PI / 2, 0, 0]" receive-shadow>
    <TresPlaneGeometry :args="[24, 24]" />
    <TresMeshLambertMaterial color="#6b4a32" />
  </TresMesh>
  <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, 0.002, 0]" receive-shadow>
    <TresPlaneGeometry :args="[7, 12]" />
    <TresMeshLambertMaterial color="#a8402e" />
  </TresMesh>
  <!-- Walls -->
  <TresMesh :position="[0, 3, -10]">
    <TresBoxGeometry :args="[24, 6, 0.2]" />
    <TresMeshLambertMaterial color="#c9d3df" />
  </TresMesh>
  <TresMesh :position="[0, 3, 10]">
    <TresBoxGeometry :args="[24, 6, 0.2]" />
    <TresMeshLambertMaterial color="#c9d3df" />
  </TresMesh>
  <TresMesh :position="[-10, 3, 0]">
    <TresBoxGeometry :args="[0.2, 6, 24]" />
    <TresMeshLambertMaterial color="#b4c0ce" />
  </TresMesh>
  <TresMesh :position="[10, 3, 0]">
    <TresBoxGeometry :args="[0.2, 6, 24]" />
    <TresMeshLambertMaterial color="#b4c0ce" />
  </TresMesh>
  <!-- Low barriers around the court -->
  <TresMesh :position="[0, 0.35, -5.5]">
    <TresBoxGeometry :args="[7, 0.7, 0.05]" />
    <TresMeshLambertMaterial color="#1d3f7a" />
  </TresMesh>
  <TresMesh :position="[0, 0.35, 5.5]">
    <TresBoxGeometry :args="[7, 0.7, 0.05]" />
    <TresMeshLambertMaterial color="#1d3f7a" />
  </TresMesh>

  <!-- Table top -->
  <TresMesh :position="[0, top - 0.015, 0]" receive-shadow cast-shadow>
    <TresBoxGeometry :args="[T.width, 0.03, T.length]" />
    <TresMeshLambertMaterial color="#1f5fa8" />
  </TresMesh>
  <!-- Side lines, end lines, centre line -->
  <TresMesh :position="[T.halfWidth - LINE / 2, top + 0.0005, 0]">
    <TresBoxGeometry :args="[LINE, 0.001, T.length]" />
    <TresMeshBasicMaterial color="#ffffff" />
  </TresMesh>
  <TresMesh :position="[-T.halfWidth + LINE / 2, top + 0.0005, 0]">
    <TresBoxGeometry :args="[LINE, 0.001, T.length]" />
    <TresMeshBasicMaterial color="#ffffff" />
  </TresMesh>
  <TresMesh :position="[0, top + 0.0005, T.halfLength - LINE / 2]">
    <TresBoxGeometry :args="[T.width, 0.001, LINE]" />
    <TresMeshBasicMaterial color="#ffffff" />
  </TresMesh>
  <TresMesh :position="[0, top + 0.0005, -T.halfLength + LINE / 2]">
    <TresBoxGeometry :args="[T.width, 0.001, LINE]" />
    <TresMeshBasicMaterial color="#ffffff" />
  </TresMesh>
  <TresMesh :position="[0, top + 0.0005, 0]">
    <TresBoxGeometry :args="[0.003, 0.001, T.length]" />
    <TresMeshBasicMaterial color="#ffffff" />
  </TresMesh>
  <!-- Legs -->
  <TresMesh v-for="([x, z], i) in legs" :key="i" :position="[x, (top - 0.03) / 2, z]">
    <TresBoxGeometry :args="[0.05, top - 0.03, 0.05]" />
    <TresMeshLambertMaterial color="#2b2f36" />
  </TresMesh>

  <!-- Net -->
  <TresMesh :position="[0, top + NET.height / 2, 0]">
    <TresPlaneGeometry :args="[netWidth, NET.height]" />
    <TresMeshBasicMaterial color="#10161f" :transparent="true" :opacity="0.55" :side="2" :depth-write="false" />
  </TresMesh>
  <TresMesh :position="[0, top + NET.height - 0.006, 0]">
    <TresBoxGeometry :args="[netWidth, 0.012, 0.004]" />
    <TresMeshBasicMaterial color="#f4f4f4" />
  </TresMesh>
  <TresMesh :position="[NET.halfWidth, top + NET.height / 2, 0]">
    <TresBoxGeometry :args="[0.02, NET.height, 0.02]" />
    <TresMeshLambertMaterial color="#2b2f36" />
  </TresMesh>
  <TresMesh :position="[-NET.halfWidth, top + NET.height / 2, 0]">
    <TresBoxGeometry :args="[0.02, NET.height, 0.02]" />
    <TresMeshLambertMaterial color="#2b2f36" />
  </TresMesh>
</template>
