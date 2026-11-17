<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { ConnectionKind, Slot } from '@mobitenis/protocol';
import { PLAYER_COLORS, PLAYER_NAMES } from '../colors.ts';
import type { PhoneHub } from '../net/phones.ts';

const props = defineProps<{ hub: PhoneHub; fps: number }>();
const emit = defineEmits<{ close: [] }>();

const CONN_TEXT: Record<ConnectionKind, string> = {
  local: 'lokalna mreža',
  public: 'preko javne adrese',
  relay: 'preko posrednika',
  unknown: '–',
};
/** Motions to record for gesture tuning (see the needs-human issue). */
const LABELS = [
  'mirovanje',
  'bocni-lijevo',
  'bocni-desno',
  'zakret-zapesca',
  'forehand-lagani',
  'forehand-jaki',
  'backhand-lagani',
  'backhand-jaki',
];
const label = ref<Record<Slot, string>>({ 0: LABELS[0]!, 1: LABELS[0]! });
const seconds = ref<Record<Slot, number>>({ 0: 10, 1: 10 });

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  props.hub.refreshStats();
  timer = setInterval(() => props.hub.refreshStats(), 500);
});
onBeforeUnmount(() => timer && clearInterval(timer));

const fmtRange = (r: { min: number; max: number }) => `${r.min.toFixed(1)} … ${r.max.toFixed(1)}`;
</script>

<template>
  <aside class="diag" data-testid="diagnostics">
    <header>
      <h2>Dijagnostika</h2>
      <span>Soba {{ hub.view.room }} · {{ fps.toFixed(0) }} FPS</span>
      <span data-testid="relay">
        Posrednik (TURN): {{ hub.view.relay === null ? '…' : hub.view.relay ? 'postavljen' : 'nije dostupan – radi samo na istoj mreži' }}
      </span>
      <button type="button" @click="emit('close')">Zatvori</button>
    </header>
    <div class="cols">
      <section v-for="slot in [0, 1] as const" :key="slot" :style="{ borderColor: PLAYER_COLORS[slot] }">
        <h3>{{ PLAYER_NAMES[slot] }} – {{ hub.view.slots[slot].status }}</h3>
        <template v-if="hub.view.slots[slot].stats">
          <dl :data-testid="`diag-${slot}`">
            <dt>Uzorci</dt>
            <dd>{{ hub.view.slots[slot].stats!.rate.toFixed(1) }} Hz (mobitel {{ hub.view.slots[slot].stats!.phoneRate.toFixed(1) }} Hz)</dd>
            <dt>Odbačeno</dt>
            <dd :data-testid="`dropped-${slot}`">
              zastarjelo {{ hub.view.slots[slot].stats!.droppedStale }}, redoslijed {{ hub.view.slots[slot].stats!.droppedOrder }},
              neispravno {{ hub.view.slots[slot].stats!.droppedKey }}, preskočeno na mobitelu {{ hub.view.slots[slot].stats!.phoneSkipped }}
            </dd>
            <dt>Veza</dt>
            <dd :data-testid="`conn-${slot}`">{{ CONN_TEXT[hub.view.slots[slot].stats!.conn] }}</dd>
            <dt>Ping</dt>
            <dd>{{ hub.view.slots[slot].stats!.rtt === null ? '–' : `${hub.view.slots[slot].stats!.rtt!.toFixed(0)} ms` }}</dd>
            <dt>Raspon</dt>
            <dd class="ranges">
              <span v-for="(r, axis) in hub.view.slots[slot].stats!.ranges" :key="axis">{{ axis }}: {{ fmtRange(r) }}</span>
            </dd>
            <dt v-if="hub.view.slots[slot].stats!.missing.length">Nedostaje</dt>
            <dd v-if="hub.view.slots[slot].stats!.missing.length">{{ hub.view.slots[slot].stats!.missing.join(', ') }}</dd>
          </dl>
          <div class="rec">
            <select v-model="label[slot]">
              <option v-for="l in LABELS" :key="l" :value="l">{{ l }}</option>
            </select>
            <select v-model.number="seconds[slot]">
              <option :value="5">5 s</option>
              <option :value="10">10 s</option>
              <option :value="30">30 s</option>
              <option :value="60">60 s</option>
            </select>
            <button type="button" :disabled="hub.view.slots[slot].status !== 'connected'" @click="hub.requestRecording(slot, seconds[slot], label[slot])">
              Snimi senzore
            </button>
          </div>
        </template>
      </section>
    </div>
    <p class="note">Snimka se po završetku preuzme kao JSON datoteka; spremi je u <code>fixtures/traces/</code>.</p>
  </aside>
</template>

<style scoped>
.diag {
  position: fixed;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 20;
  width: min(900px, calc(100% - 1rem));
  max-height: 70vh;
  overflow: auto;
  padding: 0.8rem 1rem;
  border-radius: 0.8rem;
  background: rgb(14 18 26 / 94%);
  font-size: 0.85rem;
}
header {
  display: flex;
  align-items: center;
  gap: 1rem;
}
header h2 {
  margin: 0;
  font-size: 1.1rem;
}
header button {
  margin-left: auto;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
section {
  border-left: 4px solid;
  padding-left: 0.7rem;
}
h3 {
  margin: 0.6rem 0 0.3rem;
  font-size: 0.95rem;
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.8rem;
  margin: 0;
}
dt {
  opacity: 0.7;
}
dd {
  margin: 0;
}
.ranges {
  display: grid;
  grid-template-columns: 1fr 1fr;
  font-variant-numeric: tabular-nums;
}
.rec {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.note {
  opacity: 0.7;
}
button,
select {
  padding: 0.3rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid #3a4456;
  background: #222b3a;
  color: inherit;
  font: inherit;
}
</style>
