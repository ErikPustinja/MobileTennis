<script setup lang="ts">
import { computed } from 'vue';
import { PAIRING_ERROR_TEXT, type PairingError } from '@mobitenis/net';
import type { Slot } from '@mobitenis/protocol';
import { PLAYER_NAMES } from '../colors.ts';
import type { SlotView } from '../net/phones.ts';
import QrCode from './QrCode.vue';

const props = defineProps<{ index: Slot; view: SlotView; room: string; ready: boolean; error: PairingError | null }>();
const connected = computed(() => props.view.status === 'connected');
</script>

<template>
  <div class="slot-panel" :data-status="view.status" :data-testid="`slot-status-${index}`">
    <template v-if="connected">
      <div class="ok">✓</div>
      <p class="status">{{ PLAYER_NAMES[index] }} je spojen</p>
    </template>
    <template v-else-if="ready">
      <QrCode :text="view.url" :data-testid="`qr-${index}`" />
      <p class="status">
        {{ view.status === 'reserved' ? 'Mobitel se odspojio – čekam povratak (mjesto je rezervirano 30 s)' : 'Skeniraj kamerom mobitela' }}
      </p>
      <p class="code">Kod sobe: <b>{{ room }}</b></p>
    </template>
    <template v-else-if="error">
      <p class="error" :data-testid="`pair-error-${index}`">{{ PAIRING_ERROR_TEXT[error] }}</p>
      <p class="hint">Igra tipkovnicom radi i bez interneta.</p>
    </template>
    <template v-else>
      <p class="status">Pripremam QR kod…</p>
    </template>
  </div>
</template>

<style scoped>
.slot-panel {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.4rem;
}
.ok {
  font-size: 7rem;
  line-height: 1;
  color: #3ad07a;
}
.status {
  margin: 0.4rem 0 0;
}
.code {
  margin: 0;
  opacity: 0.85;
  letter-spacing: 0.08em;
}
.error {
  margin: 0;
  color: #ffcf6e;
}
.hint {
  opacity: 0.7;
}
</style>
