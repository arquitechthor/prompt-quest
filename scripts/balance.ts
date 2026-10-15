// Simulación masiva: mide rendimiento del motor y tasas de victoria por clase y elemento.
// Uso: npm run sim -- 2000
import { BOT_DEFS } from '../src/engine/presets';
import { heuristicCompile } from '../src/engine/heuristic';
import type { AgentEntry, ClassId, ElementId } from '../src/engine/types';
import { simulate } from '../src/engine/simulate';
import { CLASSES, ELEMENTS } from '../src/engine/rules';

const N = Number(process.argv[2] ?? 1000);
const wins: Record<string, number> = {};
const plays: Record<string, number> = {};
const bump = (k: string, m: Record<string, number>) => (m[k] = (m[k] ?? 0) + 1);
let totalTurns = 0;
let bytes = 0;
const deathCauses: Record<string, number> = {};
const actions: Record<string, number> = {};
const promptWins: number[] = BOT_DEFS.map(() => 0);
const promptPlace: number[] = BOT_DEFS.map(() => 0);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  // cada partida contiene las 16 combinaciones clase x elemento exactamente una vez, con prompts rotados
  const cls = Object.keys(CLASSES) as ClassId[];
  const els = Object.keys(ELEMENTS) as ElementId[];
  const agents: AgentEntry[] = Array.from({ length: 16 }, (_, j) => {
    const c = cls[j % 4];
    const e = els[Math.floor(j / 4)];
    const p = BOT_DEFS[(j + i) % BOT_DEFS.length].prompt;
    return { id: `a${j}`, name: `a${j}`, cls: c, el: e, policy: heuristicCompile(p, c).policy };
  });
  const r = simulate(`m${i}`, 1000 + i, agents);
  totalTurns += r.turns;
  if (i < 50) bytes += JSON.stringify(r).length;
  for (const a of r.agents) {
    bump(a.cls, plays);
    bump(a.el, plays);
  }
  const w = r.agents.find((a) => a.id === r.winnerId)!;
  bump(w.cls, wins);
  bump(w.el, wins);
  for (const res of r.results) if (res.deathCause) bump(res.deathCause, deathCauses);
  for (const res of r.results) {
    const j = Number(res.agentId.slice(1));
    const p = (j + i) % BOT_DEFS.length;
    promptPlace[p] += res.place;
    if (res.place === 1) promptWins[p]++;
  }
  for (const f of r.frames) for (const d of f.decisions) bump(d[2], actions);
}
const ms = Date.now() - t0;
console.log(`${N} partidas de 16 agentes en ${ms} ms  ->  ${(ms / N).toFixed(2)} ms/partida, ${(totalTurns / N).toFixed(1)} turnos de media`);
console.log(`Tamaño medio del replay: ${(bytes / Math.min(N, 50) / 1024).toFixed(1)} KB (sin comprimir)`);
console.log('\nTasa de victoria normalizada (1.00 = justo):');
for (const k of [...Object.keys(CLASSES), ...Object.keys(ELEMENTS)]) {
  const expected = plays[k] / (16 * N);
  console.log(`  ${k.padEnd(9)} ${(((wins[k] ?? 0) / N) / expected).toFixed(2)}`);
}
console.log('\nCausas de eliminación:', deathCauses);
const totalA = Object.values(actions).reduce((s, v) => s + v, 0);
console.log('Acciones:', Object.fromEntries(Object.entries(actions).map(([k, v]) => [k, `${((v / totalA) * 100).toFixed(1)}%`])));

console.log('\nImpacto de la estrategia (mismo reparto de clases/elementos):');
BOT_DEFS.map((d, p) => ({ d, w: promptWins[p] / N, pl: promptPlace[p] / N }))
  .sort((a, b) => a.pl - b.pl)
  .forEach(({ d, w, pl }) => console.log('  ' + d.name.padEnd(10) + ' victorias ' + (w * 100).toFixed(1).padStart(5) + '%   posición media ' + pl.toFixed(1) + '   ' + d.prompt.slice(0, 70)));
