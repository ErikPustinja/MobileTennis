<script setup lang="ts">
import { computed } from 'vue';
import { renderSVG } from 'uqr';

const props = defineProps<{ text: string; size?: number }>();
const svg = computed(() => renderSVG(props.text, { border: 2, ecc: 'M', blackColor: '#000', whiteColor: '#fff' }));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="qr" :style="{ width: `${size ?? 220}px`, height: `${size ?? 220}px` }" :data-url="text" v-html="svg" />
</template>

<style scoped>
.qr {
  margin: 0 auto;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #fff;
}
.qr :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
