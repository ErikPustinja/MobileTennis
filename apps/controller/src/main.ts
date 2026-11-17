import {
  ControllerClient,
  PAIRING_ERROR_TEXT,
  REJECT_TEXT,
  newClientId,
  normalizeRoomCode,
  hasRelay,
  registerOfflineCache,
  type ControllerState,
} from '@mobitenis/net';
import {
  PLAYER_COLORS,
  PLAYER_NAMES,
  isTrace,
  type ConnectionKind,
  type GameMessage,
  type PhoneState,
  type SensorSample,
  type SensorTrace,
  type Slot,
} from '@mobitenis/protocol';
import { readParams, recall, remember } from './params.ts';
import { SensorStats, Sensors, type RawSample } from './sensors.ts';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  player: $('player'),
  conn: $('conn'),
  join: $<HTMLFormElement>('join'),
  code: $<HTMLInputElement>('code'),
  slot: $<HTMLSelectElement>('slot'),
  message: $('message'),
  warnings: $('warnings'),
  sensors: $<HTMLButtonElement>('sensors'),
  calibrate: $<HTMLButtonElement>('calibrate'),
  serve: $<HTMLButtonElement>('serve'),
  diag: $('diag-text'),
  record: $<HTMLButtonElement>('record'),
};

const CONN_TEXT: Record<ConnectionKind, string> = {
  local: 'lokalna mreža',
  public: 'preko javne adrese',
  relay: 'preko posrednika',
  unknown: 'nepoznato',
};
/** Below this rate gestures get late and coarse (Hz). */
const MIN_RATE = 30;

const params = readParams();
let relayConfigured: boolean | null = null;
void params.ice.then((servers) => {
  relayConfigured = hasRelay(servers);
});
const sensors = new Sensors();
const stats = new SensorStats();
let client: ControllerClient | null = null;
let calibrated = false;
let net: { rtt: number; conn: ConnectionKind; dropped: number } | null = null;
let gameState: PhoneState | null = null;
let lastSampleAt = 0;
let sensorsStartedAt = 0;
let recorder: { until: number; label: string; samples: SensorSample[]; toGame: boolean } | null = null;
let recSeq = 0;

function connect(room: string, slot: Slot | null, token: string | null): void {
  const known = recall(room);
  client?.stop();
  client = new ControllerClient({
    room,
    slot: known?.slot ?? slot,
    token: known && (!token || known.token === token) ? known.token : token,
    clientId: known?.clientId ?? newClientId(),
    signaling: params.signaling,
    ice: params.ice,
    onIdentity: (s, t) => remember({ room, slot: s, token: t, clientId: client!.clientId }),
  });
  client.onState = renderState;
  client.onMessage = onGameMessage;
  client.start();
  ui.join.hidden = true;
}

function renderState(s: ControllerState): void {
  switch (s.kind) {
    case 'idle':
      ui.conn.textContent = 'Nije spojeno';
      break;
    case 'connecting':
      ui.conn.textContent = 'Spajanje…';
      break;
    case 'connected':
      ui.conn.textContent = 'Spojeno';
      setPlayer(s.slot);
      ui.message.textContent = sensors.active
        ? calibrated
          ? ''
          : 'Drži mobitel kao reket i pritisni Kalibriraj.'
        : 'Pritisni Omogući senzore.';
      break;
    case 'reconnecting':
      ui.conn.textContent = `Ponovno spajanje… (${s.attempt})`;
      ui.message.textContent = s.error ? PAIRING_ERROR_TEXT[s.error] : 'Veza je prekinuta, vraćam se na isto mjesto…';
      // Show what was tried, so the cause is visible without digging.
      if (s.error && s.attempt >= 3) ($('diag') as HTMLDetailsElement).open = true;
      break;
    case 'rejected':
      ui.conn.textContent = 'Odbijeno';
      ui.message.textContent = REJECT_TEXT[s.reason];
      break;
  }
  updateButtons();
}

function setPlayer(slot: Slot): void {
  document.documentElement.style.setProperty('--c', PLAYER_COLORS[slot]);
  ui.player.textContent = PLAYER_NAMES[slot];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PLAYER_COLORS[slot]);
}

function updateButtons(): void {
  const connected = client?.connected ?? false;
  ui.calibrate.disabled = !connected || !sensors.active;
  ui.serve.disabled = !connected;
  document.body.classList.toggle('calibrated', calibrated);
}

function onGameMessage(m: GameMessage): void {
  switch (m.t) {
    case 'net':
      net = { rtt: m.rtt, conn: m.conn, dropped: m.dropped };
      break;
    case 'hit':
      navigator.vibrate?.(30);
      break;
    case 'state':
      gameState = m.state;
      renderGameState();
      break;
    case 'record':
      startRecording(m.seconds, m.label, true);
      break;
  }
}

function renderGameState(): void {
  const g = gameState;
  if (!g || !client?.connected || !calibrated) return;
  if (g.paused) ui.message.textContent = 'Pauza – pritisni Servis za nastavak.';
  else if (g.phase === 'serveReady' && g.myServe) ui.message.textContent = 'Tvoj servis: pritisni Servis pa zamahni.';
  else if (g.phase === 'lobby') ui.message.textContent = 'Spreman. Čekam početak meča.';
  else ui.message.textContent = `${g.score[0]} : ${g.score[1]}`;
}

/** One sample from the sensors or from an injected trace. */
function handleSample(s: RawSample): void {
  lastSampleAt = performance.now();
  stats.add(s);
  client?.sendSample(s);
  if (recorder) {
    recorder.samples.push({ ...s, seq: recSeq++ });
    if (performance.now() >= recorder.until) finishRecording();
  }
}

sensors.onSample = handleSample;

async function enableSensors(): Promise<void> {
  const result = await sensors.start();
  if (result !== 'ok') {
    ui.message.textContent =
      result === 'denied'
        ? 'Pristup senzorima je odbijen. U Chromeu otvori Postavke web-lokacije → Senzori pokreta i dopusti ih.'
        : 'Ovaj preglednik ne daje podatke o pokretu. Koristi Chrome na Androidu.';
    return;
  }
  sensorsStartedAt = performance.now();
  void document.documentElement.requestFullscreen?.().catch(() => {});
  void requestWakeLock();
  ui.message.textContent = 'Drži mobitel kao reket i pritisni Kalibriraj.';
  updateButtons();
}

async function requestWakeLock(): Promise<void> {
  try {
    const lock = await navigator.wakeLock?.request('screen');
    lock?.addEventListener('release', () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    });
  } catch {
    /* not critical */
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && sensors.active) void requestWakeLock();
});

function warnings(): string[] {
  if (!sensors.active) return [];
  const out: string[] = [];
  const now = performance.now();
  if (now - sensorsStartedAt > 2000 && now - lastSampleAt > 1000) {
    out.push('Senzori ne šalju podatke. Provjeri dopuštenje „Senzori pokreta“ u postavkama web-lokacije u Chromeu.');
    return out;
  }
  if (stats.missing.includes('accel'))
    out.push('Nema ubrzanja bez gravitacije: bočni pomak i jačina zamaha bit će nepouzdani.');
  if (stats.missing.includes('rot'))
    out.push('Nema žiroskopa: igra neće razlikovati pomak ruke od zakreta zapešća.');
  if (stats.missing.includes('orient')) out.push('Nema orijentacije uređaja: kut reketa se neće mijenjati.');
  if (stats.rate > 0 && stats.rate < MIN_RATE)
    out.push(`Senzori šalju samo ${stats.rate.toFixed(0)} uzoraka u sekundi (treba barem ${MIN_RATE}): udarci će kasniti i biti manje precizni.`);
  return out;
}

function renderDiag(): void {
  stats.roll();
  const ws = warnings();
  ui.warnings.replaceChildren(...ws.map((w) => Object.assign(document.createElement('li'), { textContent: w })));
  const la = client?.lastAttempt;
  const g = la?.gathered ?? {};
  const lines = [
    `Posrednik (TURN): ${relayConfigured === null ? '…' : relayConfigured ? 'postavljen' : 'nije dostupan'}`,
    `Zadnji pokušaj: ICE ${la?.ice ?? '–'}, putevi host ${g.host ?? 0}, javni ${g.srflx ?? 0}, posrednik ${g.relay ?? 0}${la?.error ? `, greška ${la.error}` : ''}`,
    `Uzorci: ${stats.rate.toFixed(1)} Hz`,
    `Poslano: ${client?.sent ?? 0}, preskočeno (zagušenje): ${client?.skipped ?? 0}`,
    `Odbačeno u igri: ${net?.dropped ?? '–'}`,
    `Veza: ${net ? CONN_TEXT[net.conn] : '–'}`,
    `Ping: ${net ? `${net.rtt.toFixed(0)} ms` : '–'}`,
    '',
    ...Object.entries(stats.ranges).map(([k, [lo, hi]]) => `${k.padEnd(9)} ${lo.toFixed(2).padStart(8)} … ${hi.toFixed(2).padStart(8)}`),
  ];
  if (stats.missing.length) lines.push(`Nedostaje: ${stats.missing.join(', ')}`);
  if (recorder) lines.unshift(`Snimanje „${recorder.label}“: još ${Math.ceil((recorder.until - performance.now()) / 1000)} s`);
  ui.diag.textContent = lines.join('\n');
  if (client?.connected) client.send({ t: 'diag', rate: stats.rate, skipped: client.skipped });
}

setInterval(renderDiag, 1000);

function startRecording(seconds: number, label: string, toGame: boolean): void {
  recSeq = 0;
  recorder = { until: performance.now() + Math.min(seconds, 60) * 1000, label, samples: [], toGame };
  ui.message.textContent = `Snimanje „${label}“…`;
  setTimeout(() => recorder && finishRecording(), Math.min(seconds, 60) * 1000 + 50);
}

function finishRecording(): void {
  const r = recorder;
  if (!r) return;
  recorder = null;
  const trace: SensorTrace = {
    format: 'mobitenis-trace',
    version: 1,
    label: r.label,
    recordedAt: new Date().toISOString(),
    device: navigator.userAgent,
    samples: r.samples,
  };
  if (r.toGame && client?.connected) {
    const CHUNK = 200;
    const total = Math.max(1, Math.ceil(r.samples.length / CHUNK));
    for (let i = 0; i < total; i++) {
      client.send({
        t: 'trace',
        part: i,
        total,
        label: r.label,
        device: trace.device,
        samples: r.samples.slice(i * CHUNK, (i + 1) * CHUNK),
      });
    }
    ui.message.textContent = `Snimka „${r.label}“ poslana igri (${r.samples.length} uzoraka).`;
  } else {
    download(`trace-${r.label}-${Date.now()}.json`, JSON.stringify(trace));
    ui.message.textContent = `Snimka spremljena (${r.samples.length} uzoraka).`;
  }
}

function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

ui.sensors.addEventListener('click', () => void enableSensors());
ui.calibrate.addEventListener('click', () => {
  client?.command('calibrate');
  calibrated = true;
  navigator.vibrate?.(15);
  ui.message.textContent = 'Kalibrirano. Pritisni Servis kad je tvoj red.';
  updateButtons();
});
ui.serve.addEventListener('click', () => {
  client?.command('serve');
  navigator.vibrate?.(10);
});
ui.record.addEventListener('click', () => startRecording(60, 'snimka', false));
ui.join.addEventListener('submit', (e) => {
  e.preventDefault();
  const room = normalizeRoomCode(ui.code.value);
  if (room.length !== 5) {
    ui.message.textContent = 'Kod sobe ima 5 znakova – prepiši ga s ekrana igre.';
    return;
  }
  const v = ui.slot.value;
  connect(room, v === '0' ? 0 : v === '1' ? 1 : null, null);
});

// The service worker lives next to the game, one level up.
if (import.meta.env.PROD) registerOfflineCache('../sw.js', '../');

if (params.room) connect(params.room, params.slot, params.token);
else {
  ui.join.hidden = false;
  ui.message.textContent = 'Skeniraj QR kod s ekrana igre ili upiši kod sobe.';
}
updateButtons();

/** Hooks for end-to-end tests (no effect in normal use). */
Object.assign(window, {
  __mobitenisController: {
    state: () => ({
      kind: client?.state.kind,
      slot: client?.slot ?? null,
      sent: client?.sent ?? 0,
      calibrated,
    }),
    /** Replays a recorded trace through the same path as live sensors. */
    injectTrace(trace: unknown): Promise<number> {
      if (!isTrace(trace) || trace.samples.length === 0) return Promise.reject(new Error('not a trace'));
      const t0 = trace.samples[0]!.t;
      const start = performance.now();
      return new Promise((resolve) => {
        let i = 0;
        const step = () => {
          const elapsed = performance.now() - start;
          while (i < trace.samples.length && trace.samples[i]!.t - t0 <= elapsed) {
            const s = trace.samples[i++]!;
            // Keep the recording's own spacing even if timers fire in bursts.
            handleSample({ t: start + (s.t - t0), accel: s.accel, accelG: s.accelG, rot: s.rot, orient: s.orient });
          }
          if (i < trace.samples.length) setTimeout(step, 4);
          else resolve(i);
        };
        step();
      });
    },
    /** Sends one sample with a timestamp `ageMs` in the past. */
    sendOld(ageMs: number): void {
      if (!client) return;
      client.sendSample({ t: performance.now() - ageMs, accel: [0, 0, 0], accelG: [0, 9.8, 0], rot: [0, 0, 0], orient: [0, 0, 0] });
    },
    /** Sends one sample whose sequence number is older than the last one. */
    sendOutOfOrder(): void {
      if (!client) return;
      client.sendRawSample({ seq: 0, t: performance.now(), accel: [0, 0, 0], accelG: [0, 9.8, 0], rot: [0, 0, 0], orient: [0, 0, 0] });
    },
    simulateDrop: () => client?.simulateDrop(),
    markCalibrated(): void {
      calibrated = true;
      updateButtons();
    },
  },
});
