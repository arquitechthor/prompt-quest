import type { ClassId, ElementId, Frame, Replay } from '../engine/types';
import { FLAG_BURN, FLAG_DEFEND } from '../engine/types';
import { EL_PAL, PX, classSprite, itemSprite, miscSprite } from './sprites';

export const EL_GLYPH = { fire: '🔥', water: '💧', earth: '🪨', air: '🌪️' } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const FONT = '"Press Start 2P", ui-monospace, Consolas, monospace';

// Instantes dentro de un turno (0 = empieza, 1 = termina). El movimiento acaba hacia 0,62.
const SHOOT = 0.12; // sale el proyectil
const HIT = 0.42; // impacto: baja la vida, destello y números
const DEATH = 0.55; // el eliminado estalla
const TOMB_TURNS = 8; // la lápida dura estos turnos

/** Pseudoaleatorio determinista (partículas, terreno): todos los dispositivos ven exactamente lo mismo. */
function hash(a: number, b: number, c: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const PROJECTILE: Record<ClassId, 'arrow' | 'rock' | null> = { archer: 'arrow', explorer: 'rock', warrior: null, ninja: null };

/** Partículas del impacto según el elemento del atacante. g = gravedad en px/turno² (negativa: sube). */
const SPARKS: Record<ElementId, { colors: string[]; g: number; speed: number; swirl?: boolean }> = {
  fire: { colors: ['#ffa300', '#ffec27', '#e43b44'], g: -60, speed: 28 },
  water: { colors: ['#29adff', '#a8e4ff', '#fff1e8'], g: 160, speed: 40 },
  earth: { colors: ['#ab5236', '#5c3524', '#a5e05c'], g: 220, speed: 44 },
  air: { colors: ['#ffffff', '#d8e2f0', '#a8e4ff'], g: 0, speed: 30, swirl: true },
};

export interface Announcement { at: number; title: string; sub: string; color: string; victory?: boolean }
export type CueKind = 'shoot' | 'throw' | 'hit' | 'bighit' | 'dodge' | 'death' | 'pickup' | 'heal' | 'chest' | 'announce' | 'victory';
export interface Cue { at: number; kind: CueKind }

interface Label { text: string; wx: number; wy: number; size: number; color: string; alpha: number }

/**
 * Dibuja un replay en un canvas para un instante fraccionario (frame + progreso).
 * Todo se pinta en un mundo de baja resolución (16 px por casilla) que se escala sin suavizado: píxeles 8 bits nítidos.
 * Cada efecto es función pura del instante, sin estado: la TV y los móviles ven lo mismo.
 */
export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private world: HTMLCanvasElement;
  private wg: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private fg: HTMLCanvasElement;
  private zone: HTMLCanvasElement;
  private zoneImg: ImageData;
  private zoneKey = '';
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private facing: Int8Array[];
  private dash: Set<number>[];
  private deaths: { k: number; a: number; x: number; y: number }[] = [];
  readonly announcements: Announcement[] = [];
  readonly cues: Cue[] = [];

  constructor(private canvas: HTMLCanvasElement, private replay: Replay, private opts: { highlightId?: string; names?: boolean } = {}) {
    this.ctx = canvas.getContext('2d')!;
    const Wp = replay.width * PX, Hp = replay.height * PX;
    this.world = Object.assign(document.createElement('canvas'), { width: Wp, height: Hp });
    this.wg = this.world.getContext('2d')!;
    this.zone = Object.assign(document.createElement('canvas'), { width: Wp, height: Hp });
    this.zoneImg = this.zone.getContext('2d')!.createImageData(Wp, Hp);
    [this.bg, this.fg] = this.terrain();
    this.facing = this.computeFacing();
    this.dash = replay.frames.map((fr) => new Set(fr.events.filter((e) => e.k === 'dash').map((e) => e.a)));
    this.precompute();
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const Wp = this.replay.width * PX, Hp = this.replay.height * PX;
    this.scale = Math.min(this.canvas.width / Wp, this.canvas.height / Hp);
    this.ox = Math.floor((this.canvas.width - Wp * this.scale) / 2);
    this.oy = Math.floor((this.canvas.height - Hp * this.scale) / 2);
  }

  // --------------------------------------------------------------------------- preparación

  /** Terreno pixel art: hierba con matas y flores, muros de piedra con sombra y arbustos (también en primer plano). */
  private terrain(): [HTMLCanvasElement, HTMLCanvasElement] {
    const { width: W, height: H, tiles, seed } = this.replay;
    const bg = Object.assign(document.createElement('canvas'), { width: W * PX, height: H * PX });
    const fg = Object.assign(document.createElement('canvas'), { width: W * PX, height: H * PX });
    const g = bg.getContext('2d')!;
    const f = fg.getContext('2d')!;
    const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && tiles[y * W + x] === 1;
    const px = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const t = tiles[ty * W + tx];
        const X = tx * PX, Y = ty * PX;
        const r = (n: number) => hash(seed + tx, ty, n);
        if (t === 1) {
          if (wall(tx, ty + 1)) {
            px(g, '#a39c94', X, Y, PX, PX);
          } else {
            px(g, '#a39c94', X, Y, PX, 6);
            px(g, '#7a7068', X, Y + 6, PX, 10);
            px(g, '#4f4740', X, Y + 10, PX, 1);
            px(g, '#4f4740', X, Y + 14, PX, 1);
            px(g, '#4f4740', X + 8, Y + 6, 1, 4);
            px(g, '#4f4740', X + 4, Y + 11, 1, 3);
            px(g, '#4f4740', X + 12, Y + 11, 1, 3);
            px(g, '#2a2430', X, Y + 15, PX, 1);
          }
          if (!wall(tx, ty - 1)) px(g, '#c2c3c7', X, Y, PX, 1);
          if (!wall(tx - 1, ty)) px(g, '#5f574f', X, Y, 1, PX);
          if (!wall(tx + 1, ty)) px(g, '#5f574f', X + PX - 1, Y, 1, PX);
          if (r(5) < 0.25) px(g, '#5f574f', X + 3 + Math.floor(r(6) * 9), Y + 2 + Math.floor(r(7) * 2), 2, 1);
          continue;
        }
        px(g, r(1) < 0.5 ? '#2b4a2f' : '#2e5032', X, Y, PX, PX);
        for (let j = 0, n = Math.floor(r(2) * 4); j < n; j++) {
          const gx = X + 1 + Math.floor(r(10 + j) * 12), gy = Y + 2 + Math.floor(r(20 + j) * 12);
          px(g, '#3d6b40', gx, gy);
          px(g, '#3d6b40', gx + 2, gy);
          px(g, '#3d6b40', gx + 1, gy + 1);
        }
        if (r(3) < 0.07) px(g, ['#ffec27', '#ff77a8', '#fff1e8'][Math.floor(r(30) * 3)], X + 2 + Math.floor(r(31) * 12), Y + 2 + Math.floor(r(32) * 12));
        if (r(4) < 0.06) {
          const sx = X + 2 + Math.floor(r(33) * 11), sy = Y + 3 + Math.floor(r(34) * 10);
          px(g, '#6b6f7a', sx, sy, 3, 2);
          px(g, '#a39c94', sx, sy, 1, 1);
        }
        if (wall(tx, ty - 1)) px(g, 'rgba(0,0,0,0.3)', X, Y, PX, 3);
        if (t === 2) for (const c of [g, f]) this.bush(c, X, Y, r);
      }
    }
    return [bg, fg];
  }

  private bush(c: CanvasRenderingContext2D, X: number, Y: number, r: (n: number) => number) {
    const blobs = [[5, 10, 5], [11, 9, 5], [8, 5, 5]];
    const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
    for (let y = 0; y < PX; y++) {
      for (let x = 0; x < PX; x++) {
        if (!inside(x, y)) continue;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        c.fillStyle = edge ? '#12391f' : y > 11 ? '#1e6b3a' : (x * 7 + y * 3 + Math.floor(r(40) * 5)) % 9 === 0 && y < 9 ? '#7bc95a' : '#2e8b3e';
        c.fillRect(X + x, Y + y, 1, 1);
      }
    }
  }

  /** Hacia dónde mira cada agente en cada frame: por su movimiento o hacia quien ataca. */
  private computeFacing() {
    const { frames, width } = this.replay;
    const out: Int8Array[] = [];
    out.push(Int8Array.from(frames[0].agents, (s) => (s[0] < width / 2 ? 1 : -1)));
    for (let k = 1; k < frames.length; k++) {
      const prev = out[k - 1], cur = Int8Array.from(prev);
      frames[k].agents.forEach((s, i) => {
        const dx = s[0] - frames[k - 1].agents[i][0];
        if (dx) cur[i] = dx > 0 ? 1 : -1;
      });
      for (const e of frames[k].events) {
        if (e.k !== 'attack') continue;
        const dx = frames[k].agents[e.t][0] - frames[k].agents[e.a][0];
        if (dx) cur[e.a] = dx > 0 ? 1 : -1;
      }
      out.push(cur);
    }
    return out;
  }

  /** Lápidas, avisos de pantalla grande y señales de sonido, todo derivado de los eventos reales. */
  private precompute() {
    const r = this.replay;
    const name = (i: number) => r.agents[i].name.replace(/^🤖 /, '');
    const alive = (fr: Frame) => fr.agents.map((s, i) => (s[4] ? i : -1)).filter((i) => i >= 0);
    const kills = new Map<number, number[]>();
    let firstBlood = false;
    const last = r.frames.length - 1;
    for (let k = 1; k <= last; k++) {
      const t = k - 1; // la transición t lleva del frame t al k
      const evs = r.frames[k].events;
      const turnCues: (Cue & { pr: number })[] = [];
      const cands: (Announcement & { pr: number })[] = [];
      for (const e of evs) {
        if (e.k === 'attack') {
          const proj = PROJECTILE[r.agents[e.a].cls];
          if (proj) turnCues.push({ at: t + SHOOT, kind: proj === 'arrow' ? 'shoot' : 'throw', pr: 1 });
          turnCues.push({ at: t + HIT, kind: e.dodged ? 'dodge' : e.special ? 'bighit' : 'hit', pr: e.special ? 4 : 2 });
        } else if (e.k === 'death') {
          const s = r.frames[t].agents[e.a];
          this.deaths.push({ k: t, a: e.a, x: s[0], y: s[1] });
          turnCues.push({ at: t + DEATH, kind: 'death', pr: 5 });
          if (e.by !== null && e.cause === 'agent') {
            const list = (kills.get(e.by) ?? []).filter((x) => k - x <= 3);
            list.push(k);
            kills.set(e.by, list);
            if (!firstBlood) cands.push({ at: t + DEATH, title: '¡PRIMERA SANGRE!', sub: name(e.by), color: '#ff004d', pr: 1 });
            if (list.length >= 2) cands.push({ at: t + DEATH, title: list.length >= 3 ? '¡TRIPLE ELIMINACIÓN!' : '¡DOBLE ELIMINACIÓN!', sub: name(e.by), color: '#ffa300', pr: 3 });
            firstBlood = true;
          }
        } else if (e.k === 'pickup') {
          turnCues.push({ at: t + 0.6, kind: 'pickup', pr: 0 });
        } else if (e.k === 'heal' && e.src !== 'water') {
          turnCues.push({ at: t + 0.3, kind: e.src === 'special' ? 'chest' : 'heal', pr: 0 });
        }
      }
      const before = alive(r.frames[t]).length, after = alive(r.frames[k]);
      if (after.length === 1 && before > 1) cands.push({ at: t + DEATH, title: '¡VICTORIA!', sub: name(after[0]), color: '#ffec27', victory: true, pr: 9 });
      else if (after.length === 2 && before > 2) cands.push({ at: t + DEATH, title: '¡DUELO FINAL!', sub: `${name(after[0])} vs ${name(after[1])}`, color: '#29adff', pr: 4 });
      else if (after.length === 3 && before > 3) cands.push({ at: t + DEATH, title: '¡QUEDAN 3!', sub: after.map(name).join(' · '), color: '#a5e05c', pr: 2 });
      // Un solo aviso por turno (el más importante) y como mucho 5 sonidos para no saturar.
      const best = cands.sort((a, b) => b.pr - a.pr)[0];
      if (best) {
        const { pr: _pr, ...a } = best;
        this.announcements.push(a);
        turnCues.push({ at: a.at + 0.05, kind: a.victory ? 'victory' : 'announce', pr: 9 });
      }
      for (const c of turnCues.sort((a, b) => b.pr - a.pr).slice(0, 5)) this.cues.push({ at: c.at, kind: c.kind });
    }
    if (alive(r.frames[last]).length > 1 && r.results[0]) {
      const w = r.agents.findIndex((a) => a.id === r.results[0].agentId);
      if (w >= 0) {
        this.announcements.push({ at: last - 0.9, title: '¡TIEMPO!', sub: `Gana ${name(w)}`, color: '#ffec27', victory: true });
        this.cues.push({ at: last - 0.85, kind: 'victory' });
      }
    }
    this.cues.sort((a, b) => a.at - b.at);
  }

  // --------------------------------------------------------------------------- utilidades de dibujo

  /** Posición (en casillas) del agente idx durante la transición k, en el instante q (0-1). */
  private posAt(k: number, idx: number, q: number): [number, number] {
    const fr = this.replay.frames;
    const a = fr[k].agents[idx], b = fr[Math.min(fr.length - 1, k + 1)].agents[idx];
    if (this.dash[k + 1]?.has(idx)) return q < 0.25 ? [a[0], a[1]] : [b[0], b[1]];
    const t = ease(clamp01(q * 1.6));
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  private ellipse(cx: number, cy: number, w: number, h: number, color: string) {
    const g = this.wg;
    g.fillStyle = color;
    for (let j = 0; j < h; j++) {
      const v = (j + 0.5 - h / 2) / (h / 2);
      const half = Math.round((w / 2) * Math.sqrt(Math.max(0, 1 - v * v)));
      g.fillRect(Math.round(cx - half), Math.round(cy - h / 2 + j), half * 2, 1);
    }
  }

  private pixelLine(x0: number, y0: number, x1: number, y1: number, color: string) {
    const g = this.wg;
    g.fillStyle = color;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let j = 0; j <= n; j++) g.fillRect(Math.round(lerp(x0, x1, j / n)), Math.round(lerp(y0, y1, j / n)), 1, 1);
  }

  private ring(cx: number, cy: number, rad: number, color: string, gap = 0) {
    const g = this.wg;
    g.fillStyle = color;
    const steps = Math.max(12, Math.round(rad * 7));
    for (let j = 0; j < steps; j++) {
      if (gap && j % gap === 0) continue;
      const a = (j / steps) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 1, 1);
    }
  }

  /** Capa de zona peligrosa: tramado diagonal animado y borde punteado, píxel a píxel. */
  private zoneLayer(cx: number, cy: number, r: number, phase: number) {
    const key = `${cx},${cy},${Math.round(r * 32)},${phase}`;
    if (key === this.zoneKey) return this.zone;
    this.zoneKey = key;
    const Wp = this.world.width, Hp = this.world.height;
    const data = new Uint32Array(this.zoneImg.data.buffer);
    const zx = (cx + 0.5) * PX, zy = (cy + 0.5) * PX, R = (r + 0.5) * PX;
    const R2 = R * R, Ro2 = (R + 2) * (R + 2);
    // ABGR (little-endian)
    const BASE = (115 << 24) | (50 << 16) | (10 << 8) | 60;
    const STRIPE = (110 << 24) | (77 << 16) | (0 << 8) | 255;
    const EDGE = (235 << 24) | (168 << 16) | (119 << 8) | 255;
    const EDGE2 = (235 << 24) | (232 << 16) | (241 << 8) | 255;
    for (let y = 0; y < Hp; y++) {
      const dy = y + 0.5 - zy;
      for (let x = 0; x < Wp; x++) {
        const dx = x + 0.5 - zx;
        const d2 = dx * dx + dy * dy;
        const i = y * Wp + x;
        if (d2 <= R2) data[i] = 0;
        else if (d2 < Ro2) data[i] = (Math.floor(((Math.atan2(dy, dx) + Math.PI) * R) / 4) + phase) & 1 ? EDGE : EDGE2;
        else data[i] = ((x + y + phase * 2) & 7) < 2 ? STRIPE : BASE;
      }
    }
    this.zone.getContext('2d')!.putImageData(this.zoneImg, 0, 0);
    return this.zone;
  }

  private particles(seed: [number, number], n: number, ox: number, oy: number, age: number, life: number, style: { colors: string[]; g: number; speed: number; swirl?: boolean }, size = 1) {
    if (age < 0 || age > life) return;
    const g = this.wg;
    for (let j = 0; j < n; j++) {
      const h1 = hash(seed[0], seed[1], j * 3), h2 = hash(seed[0], seed[1], j * 3 + 1), h3 = hash(seed[0], seed[1], j * 3 + 2);
      if (age > life * (0.6 + 0.4 * h3)) continue;
      const ang = h1 * Math.PI * 2, sp = style.speed * (0.5 + h2);
      let x: number, y: number;
      if (style.swirl) {
        const rad = 3 + sp * age * 0.6;
        x = ox + Math.cos(ang + age * 12) * rad;
        y = oy + Math.sin(ang + age * 12) * rad * 0.7;
      } else {
        x = ox + Math.cos(ang) * sp * age;
        y = oy + Math.sin(ang) * sp * age - sp * 0.4 * age + 0.5 * style.g * age * age;
      }
      g.fillStyle = style.colors[j % style.colors.length];
      g.fillRect(Math.round(x), Math.round(y), size, size);
    }
  }

  // --------------------------------------------------------------------------- fotograma

  /** f = índice de frame fraccionario (p.ej. 12.4 = 40 % de la transición del turno 12 al 13). */
  draw(f: number) {
    const r = this.replay;
    const g = this.wg;
    const last = r.frames.length - 1;
    const i = Math.max(0, Math.min(last, Math.floor(f)));
    const p = f >= last ? 1 : clamp01(f - i);
    const A = r.frames[i];
    const B = r.frames[Math.min(last, i + 1)];
    const pe = ease(clamp01(p * 1.6));
    const labels: Label[] = [];
    // transiciones con efectos aún vivos: la actual y la anterior
    const ks = [i - 1, i].filter((k) => k >= 0 && k + 1 <= last && f >= k);

    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);

    // lápidas de los caídos
    for (const d of this.deaths) {
      const age = f - (d.k + DEATH + 0.35);
      if (age < 0 || age > TOMB_TURNS) continue;
      g.globalAlpha = Math.min(1, TOMB_TURNS - age);
      g.drawImage(miscSprite('tomb'), d.x * PX, d.y * PX - (age < 0.12 ? 3 : 0));
    }
    g.globalAlpha = 1;

    // objetos (con un pequeño rebote) y los que caen del cielo
    const items = p > 0.55 ? B.items : A.items;
    for (const it of items) {
      const bob = Math.floor(f * 2 + it.id) % 2;
      this.ellipse(it.x * PX + 8, it.y * PX + 13, 8, 2, 'rgba(0,0,0,0.35)');
      g.drawImage(itemSprite(it.type), it.x * PX, it.y * PX - bob);
    }
    if (i < last && p < 0.55) {
      for (const e of B.events) {
        if (e.k !== 'spawn') continue;
        const t = clamp01(p / 0.5);
        this.ellipse(e.x * PX + 8, e.y * PX + 13, 2 + 6 * t, 2, 'rgba(0,0,0,0.35)');
        g.drawImage(itemSprite(e.item), e.x * PX, e.y * PX - Math.round(48 * (1 - t) * (1 - t)));
      }
    }

    // zona peligrosa
    const zr = lerp(A.zone.r, B.zone.r, pe);
    if (zr < r.width * 1.5) g.drawImage(this.zoneLayer(A.zone.cx, A.zone.cy, zr, Math.floor(f * 4) & 7), 0, 0);

    // agentes: posición, embestidas, retrocesos y destellos derivados de los eventos
    const off = r.agents.map(() => ({ dx: 0, dy: 0, flash: false, glitch: false }));
    for (const k of ks) {
      const q = f - k;
      for (const e of r.frames[k + 1].events) {
        if (e.k === 'attack') {
          const [ax, ay] = this.posAt(k, e.a, q), [tx, ty] = this.posAt(k, e.t, q);
          const len = Math.hypot(tx - ax, ty - ay) || 1, ux = (tx - ax) / len, uy = (ty - ay) / len;
          if (!PROJECTILE[r.agents[e.a].cls] && q > 0.2 && q < 0.5) {
            const s = Math.sin((Math.PI * (q - 0.2)) / 0.3) * (e.special ? 7 : 5);
            off[e.a].dx += ux * s;
            off[e.a].dy += uy * s;
          }
          const age = q - HIT;
          if (e.dodged) {
            if (age > -0.1 && age < 0.2) {
              const s = Math.sin((Math.PI * (age + 0.1)) / 0.3) * 4;
              off[e.t].dx += -uy * s;
              off[e.t].dy += ux * s;
            }
          } else if (age >= 0 && age < 0.25) {
            const s = (1 - age / 0.25) * (e.special ? 4 : 2);
            off[e.t].dx += ux * s;
            off[e.t].dy += uy * s;
            if (age < 0.07 || (age > 0.13 && age < 0.19)) off[e.t].flash = true;
          }
        } else if (e.k === 'zone' && q > 0.45 && q < 0.75) off[e.a].glitch = true;
      }
    }

    const order = r.agents.map((_, idx) => idx).sort((x, y) => lerp(A.agents[x][1], B.agents[x][1], pe) - lerp(A.agents[y][1], B.agents[y][1], pe));
    const status: (() => void)[] = [];
    for (const idx of order) {
      const ag = r.agents[idx];
      const a = A.agents[idx], b = B.agents[idx];
      if (!a[4]) continue;
      const dying = !b[4];
      if (dying && p >= DEATH) continue;
      const [wx, wy] = i < last ? this.posAt(i, idx, p) : [a[0], a[1]];
      const o = off[idx];
      const sx = Math.round(wx * PX + o.dx), sy = Math.round(wy * PX + o.dy);
      const moving = (a[0] !== b[0] || a[1] !== b[1]) && p < 0.62;
      const bob = moving ? Math.floor(f * 10) % 2 : Math.floor(f * 2 + idx) % 2;
      const me = ag.id === this.opts.highlightId;
      if (me) {
        this.ellipse(sx + 8, sy + 14, 16, 5, '#ffec27');
        this.ellipse(sx + 8, sy + 14, 12, 3, '#8a6d00');
      }
      this.ellipse(sx + 8, sy + 14, 12, 3, EL_PAL[ag.el].C);
      const flash = o.flash || (dying && p > HIT && Math.floor(f * 24) % 2 === 0);
      const spr = classSprite(ag.cls, ag.el, this.facing[Math.min(last, i + 1)][idx] < 0, flash);
      if (o.glitch || (dying && p > HIT && r.frames[i + 1].events.some((e) => e.k === 'death' && e.a === idx && e.cause === 'zone'))) {
        for (let s = 0; s < 4; s++) {
          const shift = Math.round((hash(idx, Math.floor(f * 20), s) - 0.5) * 6);
          g.drawImage(spr, 0, s * 4, 16, 4, sx + shift, sy - bob + s * 4, 16, 4);
        }
      } else {
        g.drawImage(spr, sx, sy - bob);
      }

      // estado: se dibuja después de los arbustos para que se vea aunque el agente esté escondido
      const hpNow = p < HIT ? a[2] : b[2], shNow = p < HIT ? a[3] : b[3];
      status.push(() => {
        if (b[5] & FLAG_BURN) {
          const fl = miscSprite('flame');
          g.save();
          if (Math.floor(f * 8) % 2) {
            g.translate(sx + 16, 0);
            g.scale(-1, 1);
            g.drawImage(fl, 3, sy - bob - 1);
          } else {
            g.drawImage(fl, sx + 3, sy - bob - 1);
          }
          g.restore();
        }
        if (b[5] & FLAG_DEFEND) this.ring(sx + 8, sy + 8 - bob, 10, '#9fd8ff', 5);
        const hp = clamp01(hpNow / ag.maxHp);
        g.fillStyle = '#1a1c2c';
        g.fillRect(sx + 1, sy - 5, 14, 4);
        g.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#ffec27' : '#ff004d';
        g.fillRect(sx + 2, sy - 4, Math.max(hp > 0 ? 1 : 0, Math.round(12 * hp)), 2);
        if (shNow > 0) {
          g.fillStyle = '#29adff';
          g.fillRect(sx + 2, sy - 6, Math.max(1, Math.round(12 * Math.min(1, shNow / 40))), 1);
        }
        if (me) {
          const ay = sy - 12 - (Math.floor(f * 3) % 2);
          g.fillStyle = '#1a1c2c';
          g.fillRect(sx + 4, ay - 1, 9, 1);
          g.fillStyle = '#ffec27';
          g.fillRect(sx + 5, ay, 7, 1);
          g.fillRect(sx + 6, ay + 1, 5, 1);
          g.fillRect(sx + 7, ay + 2, 3, 1);
          g.fillRect(sx + 8, ay + 3, 1, 1);
        }
        if (this.opts.names || me) labels.push({ text: ag.name.replace(/^🤖 /, ''), wx: sx + 8, wy: sy + 17, size: 0, color: me ? '#ffec27' : '#fff1e8', alpha: 1 });
      });
    }

    // arbustos en primer plano: quien se esconde queda medio tapado
    g.globalAlpha = 0.8;
    g.drawImage(this.fg, 0, 0);
    g.globalAlpha = 1;
    for (const s of status) s();

    // efectos de las transiciones vivas
    let shake = 0;
    for (const k of ks) {
      const q = f - k;
      const fr = r.frames[k + 1];
      fr.events.forEach((e, n) => {
        const seed: [number, number] = [k * 64 + n, r.seed];
        if (e.k === 'attack') {
          const att = r.agents[e.a];
          const [ax, ay] = this.posAt(k, e.a, q), [tx, ty] = this.posAt(k, e.t, q);
          const x0 = ax * PX + 8, y0 = ay * PX + 7, x1 = tx * PX + 8, y1 = ty * PX + 8;
          const proj = PROJECTILE[att.cls];
          if (proj && q >= SHOOT && q < HIT + (e.dodged ? 0.12 : 0)) {
            const t = (q - SHOOT) / (HIT - SHOOT);
            const dist = Math.hypot(x1 - x0, y1 - y0);
            const at = (s: number) => [lerp(x0, x1, s), lerp(y0, y1, s) - Math.sin(Math.PI * Math.min(1, s)) * dist * (proj === 'rock' ? 0.35 : 0.12)];
            if (proj === 'arrow') {
              if (e.special) for (let j = 1; j <= 4; j++) {
                const [hx, hy] = at(t - j * 0.06);
                g.fillStyle = j % 2 ? '#ffec27' : '#ffa300';
                g.fillRect(Math.round(hx), Math.round(hy), 2, 2);
              }
              const [hx, hy] = at(t), [px, py] = at(t - 0.05);
              g.save();
              g.translate(Math.round(hx), Math.round(hy));
              g.rotate(Math.atan2(hy - py, hx - px));
              if (e.special) g.filter = 'brightness(1.6) sepia(1) saturate(4) hue-rotate(5deg)';
              g.drawImage(miscSprite('arrow'), -9, -1);
              g.restore();
            } else {
              const [hx, hy] = at(t);
              g.fillStyle = '#1a1c2c';
              g.fillRect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
              g.fillStyle = '#a39c94';
              g.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
            }
          }
          const age = q - HIT;
          if (!proj && age > -0.05 && age < 0.12) {
            const t = clamp01((age + 0.05) / 0.08), len = 6 + (e.special ? 4 : 0);
            const dir = x1 >= x0 ? 1 : -1;
            const col = e.special ? '#ffec27' : '#fff1e8';
            for (const o of e.special ? [-3, 0, 3] : [-2, 2]) {
              this.pixelLine(x1 - dir * len + o, y1 - len, lerp(x1 - dir * len, x1 + dir * len, t) + o, lerp(y1 - len, y1 + len, t), col);
            }
          }
          if (age >= 0 && !e.dodged) {
            this.particles(seed, e.special ? 16 : 8, x1, y1, age, 0.6, SPARKS[att.el], e.special ? 2 : 1);
            if (e.special && age < 0.3) shake += 2.2 * (1 - age / 0.3);
            if (e.special && att.cls === 'warrior' && age < 0.5) {
              this.ring(x1, y1, 4 + 34 * age, age < 0.25 ? '#fff1e8' : '#ffec27');
              this.ring(x1, y1, 2 + 26 * age, '#ffa300', 3);
            }
            if (e.special && att.cls === 'archer' && age < 0.25) {
              const l = 3 + 12 * age / 0.25;
              for (let j = 0; j < 8; j++) {
                const an = (j / 8) * Math.PI * 2;
                this.pixelLine(x1 + Math.cos(an) * l * 0.4, y1 + Math.sin(an) * l * 0.4, x1 + Math.cos(an) * l, y1 + Math.sin(an) * l, '#ffec27');
              }
            }
          }
          if (age >= 0 && age < 1) {
            const pop = age < 0.1 ? 1.5 - age * 5 : 1;
            const alpha = age > 0.7 ? (1 - age) / 0.3 : 1;
            const wy = ty * PX - 4 - 12 * Math.sqrt(age);
            labels.push({ text: e.dodged ? '¡ESQUIVA!' : `-${e.dmg}`, wx: x1, wy, size: (e.special ? 1.5 : 1.1) * pop, color: e.dodged ? '#c2c3c7' : e.special ? '#ffec27' : '#fff1e8', alpha });
            if (e.adv && !e.dodged) labels.push({ text: '¡SÚPER EFICAZ!', wx: x1, wy: wy - 9, size: 0.7 * pop, color: '#ffa300', alpha });
          }
        } else if (e.k === 'dash') {
          const a0 = r.frames[k].agents[e.a];
          if (q > 0.2 && q < 0.75) {
            const fade = 1 - (q - 0.2) / 0.55;
            const spr = classSprite(r.agents[e.a].cls, r.agents[e.a].el, this.facing[k + 1][e.a] < 0);
            for (let j = 1; j <= 4; j++) {
              g.globalAlpha = 0.45 * fade * (j / 4);
              g.drawImage(spr, Math.round(lerp(a0[0], e.x, j / 5) * PX), Math.round(lerp(a0[1], e.y, j / 5) * PX));
            }
            g.globalAlpha = 1;
          }
          this.particles(seed, 10, a0[0] * PX + 8, a0[1] * PX + 10, q - 0.22, 0.5, { colors: ['#5f574f', '#8b9bb4', '#29233a'], g: -20, speed: 18 }, 2);
        } else if (e.k === 'heal') {
          if (e.src === 'water') return;
          const [hx, hy] = this.posAt(k, e.a, q);
          const cx = hx * PX + 8, cy = hy * PX;
          if (e.src === 'special') {
            if (q > 0.15 && q < 0.9) {
              g.globalAlpha = q > 0.75 ? (0.9 - q) / 0.15 : 1;
              g.drawImage(itemSprite('treasure'), Math.round(cx - 8), Math.round(cy - 14 - 6 * clamp01((q - 0.15) / 0.2)));
              g.globalAlpha = 1;
            }
            this.particles(seed, 12, cx, cy - 12, q - 0.35, 0.6, { colors: ['#ffec27', '#ffa300', '#fff1e8'], g: 140, speed: 34 });
          } else {
            this.particles(seed, 8, cx, cy + 10, q - 0.2, 0.7, { colors: ['#4ade80', '#a5e05c', '#fff1e8'], g: -50, speed: 12 });
          }
          if (q > 0.25 && q < 1.2) labels.push({ text: `+${e.amount}`, wx: cx, wy: cy - 6 - 10 * clamp01(q - 0.25), size: 1, color: '#4ade80', alpha: q > 0.9 ? (1.2 - q) / 0.3 : 1 });
        } else if (e.k === 'pickup') {
          const age = q - 0.55;
          if (age >= 0 && age < 0.45) {
            const cx = e.x * PX + 8, cy = e.y * PX + 8, l = 2 + 10 * age;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.pixelLine(cx + dx * l * 0.5, cy + dy * l * 0.5, cx + dx * l, cy + dy * l, '#ffec27');
            g.globalAlpha = 1 - age / 0.45;
            g.drawImage(itemSprite(e.item), cx - 4, Math.round(cy - 14 - 16 * age), 8, 8);
            g.globalAlpha = 1;
          }
        } else if (e.k === 'burn' || e.k === 'zone') {
          if (q > 0.5 && q < 1.3) {
            const [hx, hy] = this.posAt(k, e.a, q);
            labels.push({ text: `-${e.dmg}`, wx: hx * PX + 8, wy: hy * PX - 4 - 8 * (q - 0.5), size: 0.85, color: e.k === 'burn' ? '#ffa300' : '#ff77a8', alpha: q > 1 ? (1.3 - q) / 0.3 : 1 });
          }
        } else if (e.k === 'death') {
          const s = r.frames[k].agents[e.a];
          const ag = r.agents[e.a];
          const cx = s[0] * PX + 8, cy = s[1] * PX + 8;
          const age = q - DEATH;
          const style = e.cause === 'zone'
            ? { colors: ['#ff77a8', '#a25cff', '#fff1e8'], g: -40, speed: 26 }
            : e.cause === 'burn'
              ? { colors: ['#ffa300', '#e43b44', '#5f574f'], g: -50, speed: 24 }
              : { colors: [EL_PAL[ag.el].c, EL_PAL[ag.el].l, '#1a1c2c', '#ffccaa'], g: 120, speed: 46 };
          this.particles(seed, 22, cx, cy, age, 0.8, style, 2);
          if (age >= 0 && age < 0.3) shake += 1.5 * (1 - age / 0.3);
        }
      });
    }

    // a pantalla: escalado entero de píxeles, con temblor en los golpes fuertes
    const c = this.ctx;
    const S = this.scale;
    const shx = shake ? Math.round(Math.sin(f * 97) * shake) : 0, shy = shake ? Math.round(Math.cos(f * 71) * shake) : 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0d111a';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.world, this.ox + shx * S, this.oy + shy * S, this.world.width * S, this.world.height * S);

    // textos en resolución de pantalla con la fuente pixelada
    const T = PX * S;
    c.textAlign = 'center';
    c.lineJoin = 'round';
    for (const l of labels) {
      const name = l.size === 0;
      const size = Math.max(name ? 7 : 9, Math.round(T * (name ? 0.19 : 0.26) * (l.size || 1)));
      c.font = `${size}px ${FONT}`;
      c.textBaseline = name ? 'top' : 'bottom';
      c.globalAlpha = clamp01(l.alpha);
      const x = this.ox + (l.wx + shx) * S, y = this.oy + (l.wy + shy) * S;
      c.strokeStyle = '#1a1c2c';
      c.lineWidth = Math.max(2, size / 3);
      c.strokeText(l.text, x, y);
      c.fillStyle = l.color;
      c.fillText(l.text, x, y);
    }
    c.globalAlpha = 1;
    this.drawAnnouncement(f);
  }

  /** Avisos de pantalla grande («¡PRIMERA SANGRE!», «¡DUELO FINAL!»…), con entrada de golpe y salida suave. */
  private drawAnnouncement(f: number) {
    const DUR = 1.8;
    let cur: Announcement | null = null;
    for (const a of this.announcements) if (f >= a.at && f < a.at + DUR) cur = a;
    if (!cur) return;
    const c = this.ctx;
    // ceñido al mapa, no al canvas entero (en el stand el canvas es más ancho que la arena)
    const W = this.world.width * this.scale, H = this.world.height * this.scale;
    const X = this.ox + W / 2;
    const age = f - cur.at;
    const pop = age < 0.12 ? 1.7 - (age / 0.12) * 0.7 : 1;
    c.globalAlpha = age > DUR - 0.35 ? (DUR - age) / 0.35 : 1;
    const base = Math.min(W / (cur.title.length + 2), H * 0.085);
    const size = Math.round(base * pop);
    const sub = Math.round(Math.min(W / (cur.sub.length + 4), base * 0.42));
    const y = this.oy + H * 0.3;
    c.fillStyle = 'rgba(10, 8, 22, 0.6)';
    c.fillRect(this.ox, y - base * 1.1, W, base * 2.2 + sub * 1.6);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.font = `${size}px ${FONT}`;
    c.fillStyle = '#1a1c2c';
    c.fillText(cur.title, X + size / 8, y + size / 8);
    c.strokeStyle = '#1a1c2c';
    c.lineWidth = Math.max(3, size / 5);
    c.strokeText(cur.title, X, y);
    c.fillStyle = cur.color;
    c.fillText(cur.title, X, y);
    if (cur.sub) {
      c.font = `${sub}px ${FONT}`;
      c.lineWidth = Math.max(2, sub / 3);
      c.strokeText(cur.sub, X, y + base * 0.9 + sub * 0.6);
      c.fillStyle = '#fff1e8';
      c.fillText(cur.sub, X, y + base * 0.9 + sub * 0.6);
    }
    c.globalAlpha = 1;
  }
}
