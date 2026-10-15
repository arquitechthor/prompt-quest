import { ACTION_ES } from '../engine/policy';
import { CLASSES, ELEMENTS } from '../engine/rules';
import type { Replay } from '../engine/types';

/** Hechos verificables de la partida: base para la crónica (plantilla o LLM). Nunca inventamos motivos. */
export function matchFacts(r: Replay) {
  const name = (idx: number) => r.agents[idx]?.name ?? '?';
  const byId = new Map(r.agents.map((a, i) => [a.id, i]));
  const winner = r.winnerId ? r.agents[byId.get(r.winnerId)!] : null;
  const winRes = r.results[0];
  let firstBlood: string | null = null;
  let biggestHit = { dmg: 0, a: -1, t: -1, special: false };
  const deaths: string[] = [];
  for (const f of r.frames) {
    for (const e of f.events) {
      if (e.k === 'attack' && e.dmg > biggestHit.dmg) biggestHit = { dmg: e.dmg, a: e.a, t: e.t, special: !!e.special };
      if (e.k === 'death') {
        const txt = e.cause === 'zone' ? `${name(e.a)} cayó fuera de la zona en el turno ${f.t}` : e.by !== null ? `${name(e.by)} eliminó a ${name(e.a)} en el turno ${f.t}` : `${name(e.a)} cayó en el turno ${f.t}`;
        if (!firstBlood) firstBlood = txt;
        deaths.push(txt);
      }
    }
  }
  const winnerIdx = winner ? byId.get(winner.id)! : -1;
  const winnerActions: Record<string, number> = {};
  if (winnerIdx >= 0) for (const f of r.frames) for (const d of f.decisions) if (d[0] === winnerIdx) winnerActions[d[2]] = (winnerActions[d[2]] ?? 0) + 1;
  const topAction = Object.entries(winnerActions).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topRule = winRes ? winRes.ruleFires.indexOf(Math.max(...winRes.ruleFires, 0)) : -1;
  return {
    turns: r.turns,
    players: r.agents.length,
    winner: winner
      ? {
          name: winner.name,
          cls: CLASSES[winner.cls].name,
          el: ELEMENTS[winner.el].name,
          strategy: winner.summary,
          kills: winRes.kills,
          topAction: topAction ? ACTION_ES[topAction as keyof typeof ACTION_ES] : null,
          topRule: topRule >= 0 && winRes.ruleFires[topRule] > 0 ? winner.rules[topRule] : null,
          survivedAll: r.frames[r.frames.length - 1].agents.filter((s) => s[4]).length === 1,
        }
      : null,
    firstBlood,
    biggestHit: biggestHit.a >= 0 ? { by: name(biggestHit.a), on: name(biggestHit.t), dmg: biggestHit.dmg, special: biggestHit.special } : null,
    lastDeaths: deaths.slice(-3),
  };
}

export function templateNarration(r: Replay): string {
  const f = matchFacts(r);
  if (!f.winner) return 'La arena ha quedado en silencio.';
  const parts = [
    `¡${f.winner.name} (${f.winner.cls} de ${f.winner.el}) se lleva la victoria tras ${f.turns} turnos!`,
    f.firstBlood ? `Primera sangre: ${f.firstBlood}.` : '',
    f.biggestHit ? `El golpe más duro: ${f.biggestHit.dmg} de daño de ${f.biggestHit.by} a ${f.biggestHit.on}${f.biggestHit.special ? ' con su habilidad especial' : ''}.` : '',
    f.winner.topRule ? `La clave del campeón: «${f.winner.topRule}».` : '',
  ];
  return parts.filter(Boolean).join(' ');
}
