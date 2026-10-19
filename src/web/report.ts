import { ACTION_ES } from '../engine/policy';
import { ITEMS } from '../engine/rules';
import type { AgentResult, Replay } from '../engine/types';
import { itemImg, spriteImg } from './sprites';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Línea de feed para la pantalla grande: qué hizo cada agente y POR QUÉ (qué regla de su prompt se activó). */
export function feedLines(r: Replay, frameIdx: number): { html: string; kind: string }[] {
  const f = r.frames[frameIdx];
  if (!f) return [];
  const name = (i: number) => esc(r.agents[i].name.replace(/^🤖 /, ''));
  const glyph = (i: number) => spriteImg(r.agents[i].cls, r.agents[i].el, 20);
  const reason = (i: number) => {
    const d = f.decisions.find((x) => x[0] === i);
    if (!d) return '';
    if (d[1] === -1) return 'instinto: volver a la zona';
    if (d[1] === -2) return `por defecto: ${ACTION_ES[d[2]]}`;
    return r.agents[i].rules[d[1]] ?? ACTION_ES[d[2]];
  };
  const out: { html: string; kind: string }[] = [];
  for (const e of f.events) {
    if (e.k === 'attack' && (e.special || e.dmg >= 18 || e.dodged)) {
      const what = e.dodged ? `falla contra ${name(e.t)} (esquiva)` : `${e.special ? '<b>¡ESPECIAL!</b> ' : ''}golpea a ${name(e.t)} por <b>${e.dmg}</b>${e.adv ? ' ⚡' : ''}`;
      out.push({ kind: e.special ? 'special' : 'attack', html: `${glyph(e.a)} <b>${name(e.a)}</b> ${what} <span class="why">«${esc(reason(e.a))}»</span>` });
    } else if (e.k === 'death') {
      const how = e.cause === 'zone' ? 'cae fuera de la zona' : e.cause === 'burn' ? `arde hasta caer${e.by !== null ? ` (fuego de ${name(e.by)})` : ''}` : `es eliminado por <b>${name(e.by!)}</b>`;
      out.push({ kind: 'death', html: `💀 <b>${name(e.a)}</b> ${how}` });
    } else if (e.k === 'pickup' && (e.item === 'treasure' || e.item === 'orb' || e.item === 'sword')) {
      out.push({ kind: 'pickup', html: `${itemImg(e.item, 20)} <b>${name(e.a)}</b> recoge ${ITEMS[e.item].name.toLowerCase()} <span class="why">«${esc(reason(e.a))}»</span>` });
    } else if (e.k === 'dash') {
      const d = f.decisions.find((x) => x[0] === e.a);
      if (d && d[2] === 'flee') out.push({ kind: 'special', html: `💨 <b>${name(e.a)}</b> escapa con Sombra fugaz <span class="why">«${esc(reason(e.a))}»</span>` });
    }
  }
  return out;
}

export interface Lesson {
  icon: string;
  text: string;
}

/** Informe post-partida derivado SOLO de eventos reales del motor (sin inventar motivos). */
export function lessons(r: Replay, agentId: string): { res: AgentResult; idx: number; lessons: Lesson[]; killer: string | null; decisions: number } {
  const idx = r.agents.findIndex((a) => a.id === agentId);
  const res = r.results.find((x) => x.agentId === agentId)!;
  const ag = r.agents[idx];
  const total = r.frames.reduce((s, f) => s + f.decisions.filter((d) => d[0] === idx).length, 0);
  const out: Lesson[] = [];
  const killer = res.killedBy ? (r.agents.find((a) => a.id === res.killedBy)?.name ?? null) : null;
  const half = Math.ceil(r.agents.length / 2);

  if (res.place === 1) out.push({ icon: '🏆', text: '¡Victoria! Tu estrategia ha funcionado. ¿Te atreves a ganar con otra clase o elemento?' });
  const never = ag.rules.map((label, i) => ({ label, n: res.ruleFires[i] ?? 0 })).filter((x) => x.n === 0);
  if (never.length && total > 5) out.push({ icon: '💤', text: `La regla «${never[0].label}» nunca se activó: quizá su condición es demasiado estricta o otra regla anterior la tapa.` });
  if (total > 0 && res.defaultFires / total > 0.45) out.push({ icon: '🤷', text: `Durante el ${Math.round((res.defaultFires / total) * 100)} % de los turnos ninguna regla aplicaba y tu agente se limitó a «${ACTION_ES[ag.defaultAction]}». Describe qué hacer en más situaciones.` });
  if (res.deathCause === 'zone') out.push({ icon: '🌀', text: 'Cayó fuera de la zona segura: prioriza moverte hacia el centro cuando la zona se encoge.' });
  if (res.deathCause && res.survivedTurns < 15) out.push({ icon: '⏱️', text: `Fue eliminado muy pronto (turno ${res.survivedTurns}). Añade una regla para huir o esconderte con poca salud.` });
  if (res.kills === 0 && res.damageDealt < 30 && res.place > half) out.push({ icon: '🕊️', text: 'Tu agente apenas combatió. Prueba a rematar rivales debilitados («ataca al más débil si su salud es menor del 40 %»).' });
  if (res.items === 0) out.push({ icon: '🎒', text: 'No recogió ningún objeto: pociones, escudos y filos marcan la diferencia.' });
  if (res.specialsUsed === 0 && res.survivedTurns > 10) out.push({ icon: '✨', text: 'Nunca usó su habilidad especial. Menciónala en tu estrategia.' });
  if (res.kills >= 2) out.push({ icon: '⚔️', text: `${res.kills} eliminaciones: tu agente sabe rematar.` });
  if (out.length === 0) out.push({ icon: '🔁', text: 'Estrategia sólida. Cambia una sola instrucción y comprueba si mejora tu posición: así se evalúan los agentes.' });
  return { res, idx, lessons: out.slice(0, 3), killer, decisions: total };
}
