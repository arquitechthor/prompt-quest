// Sonido chiptune sintetizado con WebAudio: sin ficheros de audio. Solo lo usa la pantalla del stand.
// Los navegadores no dejan sonar audio sin un gesto previo: basta un clic o una tecla en la pantalla
// (o arrancar Chrome con --autoplay-policy=no-user-gesture-required en modo quiosco).
import type { Cue, CueKind } from './render';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Llamar en el primer gesto del usuario para desbloquear el audio. */
export function unlockAudio() {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}
export const audioReady = () => !!ctx && ctx.state === 'running';

function tone(freq: number, dur: number, opts: { type?: OscillatorType; to?: number; vol?: number; at?: number } = {}) {
  const a = ctx!, t0 = a.currentTime + (opts.at ?? 0);
  const o = a.createOscillator(), gn = a.createGain();
  o.type = opts.type ?? 'square';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  gn.gain.setValueAtTime(opts.vol ?? 0.12, t0);
  gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(gn).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, opts: { vol?: number; freq?: number; at?: number } = {}) {
  const a = ctx!, t0 = a.currentTime + (opts.at ?? 0);
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.value = opts.freq ?? 3000;
  gn.gain.setValueAtTime(opts.vol ?? 0.2, t0);
  gn.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(gn).connect(master!);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const arp = (notes: number[], step: number, last = step, vol = 0.1) =>
  notes.forEach((n, i) => tone(n, i === notes.length - 1 ? last : step, { at: i * step, vol }));

const SOUNDS: Record<CueKind | 'beep' | 'go', () => void> = {
  shoot: () => tone(1200, 0.08, { to: 500, vol: 0.05 }),
  throw: () => tone(420, 0.09, { type: 'triangle', to: 200, vol: 0.12 }),
  hit: () => noise(0.08, { freq: 2500, vol: 0.18 }),
  bighit: () => { noise(0.25, { freq: 900, vol: 0.3 }); tone(160, 0.25, { to: 50, vol: 0.15 }); },
  dodge: () => tone(700, 0.08, { type: 'triangle', to: 1400, vol: 0.07 }),
  death: () => tone(520, 0.35, { to: 70, vol: 0.12 }),
  pickup: () => { tone(988, 0.06, { vol: 0.07 }); tone(1319, 0.12, { at: 0.06, vol: 0.07 }); },
  heal: () => tone(660, 0.15, { type: 'triangle', to: 990, vol: 0.1 }),
  chest: () => arp([784, 988, 1175, 1568], 0.05, 0.12, 0.07),
  announce: () => arp([392, 523, 659], 0.08, 0.16),
  victory: () => arp([523, 659, 784, 1047, 784, 1047], 0.1, 0.4, 0.11),
  beep: () => tone(440, 0.1, { vol: 0.08 }),
  go: () => tone(880, 0.3, { vol: 0.1 }),
};

export function play(kind: keyof typeof SOUNDS) {
  if (!audioReady()) return;
  SOUNDS[kind]();
}

/** Lanza las señales de un replay a medida que la reproducción las alcanza. */
export class CuePlayer {
  private prev = Number.NEGATIVE_INFINITY;
  private matchId = '';

  update(matchId: string, cues: Cue[], f: number) {
    if (matchId !== this.matchId) {
      this.matchId = matchId;
      this.prev = f;
      return;
    }
    // Si la pestaña estuvo en segundo plano no se dispara la avalancha acumulada.
    if (f - this.prev > 1 || f < this.prev) {
      this.prev = f;
      return;
    }
    for (const c of cues) if (c.at > this.prev && c.at <= f) play(c.kind);
    this.prev = f;
  }
}
