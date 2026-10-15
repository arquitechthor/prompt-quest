import { ELEMENTS } from '../engine/rules';
import type { ClassId, GameEvent, ItemType, Replay } from '../engine/types';
import { FLAG_BURN, FLAG_DEFEND, FLAG_HIDDEN } from '../engine/types';

export const CLASS_GLYPH: Record<ClassId, string> = { archer: '🏹', warrior: '⚔️', ninja: '🥷', explorer: '🧭' };
export const ITEM_GLYPH: Record<ItemType, string> = { potion: '🧪', shield: '🛡️', boots: '👢', sword: '🗡️', orb: '🔮', treasure: '💰' };
export const EL_GLYPH = { fire: '🔥', water: '💧', earth: '🪨', air: '🌪️' } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Dibuja un replay en un canvas para un instante fraccionario (frame + progreso). */
export class ArenaRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private tile = 20;
  private ox = 0;
  private oy = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private replay: Replay, private opts: { highlightId?: string; names?: boolean } = {}) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const { width: W, height: H } = this.replay;
    this.tile = Math.floor(Math.min(this.canvas.width / W, this.canvas.height / H));
    this.ox = Math.floor((this.canvas.width - this.tile * W) / 2);
    this.oy = Math.floor((this.canvas.height - this.tile * H) / 2);
    this.bg = null;
  }

  private background() {
    if (this.bg) return this.bg;
    const { width: W, height: H, tiles } = this.replay;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    const T = this.tile;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tiles[y * W + x];
        const px = this.ox + x * T, py = this.oy + y * T;
        g.fillStyle = (x + y) % 2 ? '#1d2433' : '#1a2030';
        g.fillRect(px, py, T, T);
        if (t === 1) {
          g.fillStyle = '#3a4152';
          g.fillRect(px + 1, py + 1, T - 2, T - 2);
          g.fillStyle = '#4a5266';
          g.fillRect(px + 1, py + 1, T - 2, Math.max(2, T * 0.25));
        } else if (t === 2) {
          g.fillStyle = '#1f5b33';
          g.beginPath();
          g.arc(px + T * 0.35, py + T * 0.55, T * 0.32, 0, Math.PI * 2);
          g.arc(px + T * 0.65, py + T * 0.5, T * 0.34, 0, Math.PI * 2);
          g.arc(px + T * 0.5, py + T * 0.32, T * 0.3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    this.bg = c;
    return c;
  }

  /** f = índice de frame fraccionario (p.ej. 12.4 = 40 % de la transición del turno 12 al 13). */
  draw(f: number) {
    const r = this.replay;
    const g = this.ctx;
    const T = this.tile;
    const last = r.frames.length - 1;
    const i = Math.max(0, Math.min(last, Math.floor(f)));
    const p = f >= last ? 1 : Math.max(0, Math.min(1, f - i));
    const A = r.frames[i];
    const B = r.frames[Math.min(last, i + 1)];
    const pe = ease(Math.min(1, p * 1.6));
    const cx = (x: number) => this.ox + (x + 0.5) * T;
    const cy = (y: number) => this.oy + (y + 0.5) * T;

    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.background(), 0, 0);

    // objetos
    const items = p > 0.55 ? B.items : A.items;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(T * 0.62)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    for (const it of items) g.fillText(ITEM_GLYPH[it.type], cx(it.x), cy(it.y) + T * 0.04);

    // zona segura
    const zr = lerp(A.zone.r, B.zone.r, pe);
    if (zr < r.width * 1.5) {
      g.save();
      g.beginPath();
      g.rect(0, 0, this.canvas.width, this.canvas.height);
      g.arc(cx(A.zone.cx), cy(A.zone.cy), (zr + 0.5) * T, 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(190, 30, 60, 0.28)';
      g.fill('evenodd');
      g.beginPath();
      g.arc(cx(A.zone.cx), cy(A.zone.cy), (zr + 0.5) * T, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(255, 80, 110, 0.85)';
      g.lineWidth = Math.max(2, T * 0.08);
      g.setLineDash([T * 0.3, T * 0.2]);
      g.stroke();
      g.restore();
    }

    // agentes
    const events: GameEvent[] = i < last && f > 0 ? B.events : [];
    r.agents.forEach((ag, idx) => {
      const a = A.agents[idx];
      const b = B.agents[idx];
      if (!a[4]) return;
      const dying = !b[4];
      const x = cx(lerp(a[0], b[0], pe));
      const y = cy(lerp(a[1], b[1], pe));
      const alpha = dying ? Math.max(0, 1 - p * 1.2) : (b[5] & FLAG_HIDDEN) ? 0.55 : 1;
      g.save();
      g.globalAlpha = alpha;
      const me = ag.id === this.opts.highlightId;
      if (me) {
        g.beginPath();
        g.arc(x, y, T * (0.62 + 0.06 * Math.sin(performance.now() / 180)), 0, Math.PI * 2);
        g.strokeStyle = '#ffe14d';
        g.lineWidth = Math.max(2, T * 0.1);
        g.stroke();
      }
      g.beginPath();
      g.arc(x, y, T * 0.44, 0, Math.PI * 2);
      g.fillStyle = ELEMENTS[ag.el].color;
      g.fill();
      if (b[5] & FLAG_DEFEND) {
        g.strokeStyle = '#9fd8ff';
        g.lineWidth = Math.max(1.5, T * 0.07);
        g.stroke();
      }
      if (b[5] & FLAG_BURN) {
        g.fillStyle = 'rgba(255,120,30,0.35)';
        g.beginPath();
        g.arc(x, y - T * 0.1, T * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.font = `${Math.round(T * 0.5)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      g.fillText(CLASS_GLYPH[ag.cls], x, y + T * 0.03);
      // barra de vida
      const hp = lerp(a[2], b[2], pe) / ag.maxHp;
      const bw = T * 0.9, bh = Math.max(3, T * 0.12);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x - bw / 2, y - T * 0.68, bw, bh);
      g.fillStyle = hp > 0.5 ? '#4ade80' : hp > 0.25 ? '#facc15' : '#f87171';
      g.fillRect(x - bw / 2, y - T * 0.68, bw * Math.max(0, hp), bh);
      if (b[3] > 0) {
        g.fillStyle = '#7dd3fc';
        g.fillRect(x - bw / 2, y - T * 0.68 - bh, bw * Math.min(1, b[3] / 40), bh * 0.7);
      }
      if (this.opts.names || me) {
        g.font = `600 ${Math.max(9, Math.round(T * 0.34))}px system-ui, sans-serif`;
        g.fillStyle = me ? '#ffe14d' : 'rgba(255,255,255,0.85)';
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.lineWidth = 3;
        const label = ag.name.replace(/^🤖 /, '');
        g.strokeText(label, x, y + T * 0.72);
        g.fillText(label, x, y + T * 0.72);
      }
      g.restore();
    });

    // efectos de los eventos de esta transición
    for (const e of events) {
      if (e.k === 'attack') {
        const a = B.agents[e.a];
        const t = A.agents[e.t];
        const fade = 1 - p;
        g.save();
        g.globalAlpha = fade;
        g.strokeStyle = e.special ? '#ffe14d' : e.dodged ? '#94a3b8' : '#ff6b6b';
        g.lineWidth = Math.max(2, T * (e.special ? 0.16 : 0.08));
        g.beginPath();
        g.moveTo(cx(a[0]), cy(a[1]));
        g.lineTo(cx(t[0]), cy(t[1]));
        g.stroke();
        g.font = `800 ${Math.round(T * (e.special ? 0.62 : 0.48))}px system-ui, sans-serif`;
        g.fillStyle = e.dodged ? '#cbd5e1' : e.special ? '#ffe14d' : '#ffffff';
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = 3;
        const txt = e.dodged ? '¡esquiva!' : `-${e.dmg}`;
        const ty = cy(t[1]) - T * (0.8 + p * 0.7);
        g.strokeText(txt, cx(t[0]), ty);
        g.fillText(txt, cx(t[0]), ty);
        g.restore();
      } else if (e.k === 'death') {
        g.save();
        g.globalAlpha = Math.min(1, p * 2) * (1 - Math.max(0, p - 0.6) * 2);
        g.font = `${Math.round(T * 0.9)}px system-ui, "Segoe UI Emoji", sans-serif`;
        const s = B.agents[e.a];
        g.fillText('💀', cx(s[0]), cy(s[1]));
        g.restore();
      } else if (e.k === 'dash') {
        g.save();
        g.globalAlpha = 1 - p;
        g.strokeStyle = '#c084fc';
        g.lineWidth = Math.max(2, T * 0.1);
        g.setLineDash([T * 0.15, T * 0.15]);
        const s = A.agents[e.a];
        g.beginPath();
        g.moveTo(cx(s[0]), cy(s[1]));
        g.lineTo(cx(e.x), cy(e.y));
        g.stroke();
        g.restore();
      } else if (e.k === 'heal' && e.src !== 'water') {
        const s = B.agents[e.a];
        g.save();
        g.globalAlpha = 1 - p;
        g.font = `800 ${Math.round(T * 0.45)}px system-ui, sans-serif`;
        g.fillStyle = '#4ade80';
        g.fillText(`+${e.amount}`, cx(s[0]), cy(s[1]) - T * (0.8 + p * 0.6));
        g.restore();
      }
    }
  }
}
