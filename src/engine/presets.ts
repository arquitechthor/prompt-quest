import { heuristicCompile } from './heuristic';
import type { AgentEntry, ClassId, ElementId } from './types';

// Bots de la casa: completan las partidas cuando hay pocos jugadores en el stand.
export const BOT_DEFS: { name: string; cls: ClassId; el: ElementId; prompt: string }[] = [
  { name: 'Halcón', cls: 'archer', el: 'fire', prompt: 'Mantén siempre la distancia, recoge mejoras de ataque y dispara al rival más débil. Si te acercan, retrocede.' },
  { name: 'Roca', cls: 'warrior', el: 'earth', prompt: 'No inicies combates si tienes menos del 70% de salud. Prioriza escudos y curación. Ataca a los enemigos visibles cuando estés fuerte.' },
  { name: 'Niebla', cls: 'ninja', el: 'air', prompt: 'Evita a los enemigos con salud completa. Remata a los rivales debilitados y huye si tu salud baja del 40%.' },
  { name: 'Brújula', cls: 'explorer', el: 'water', prompt: 'Explora zonas desconocidas y recoge tesoros y mejoras. Evita combates salvo ventaja clara. Huye si tu salud baja del 50%.' },
  { name: 'Brasa', cls: 'warrior', el: 'fire', prompt: 'Ataca agresivamente al enemigo más cercano y usa tu habilidad especial siempre que esté lista.' },
  { name: 'Marea', cls: 'archer', el: 'water', prompt: 'Escóndete en los arbustos, dispara desde lejos y usa tu habilidad especial contra rivales debilitados.' },
  { name: 'Vendaval', cls: 'ninja', el: 'air', prompt: 'Caza a los rivales con ventaja elemental, usa tu habilidad especial y remata a los heridos.' },
  { name: 'Jade', cls: 'explorer', el: 'earth', prompt: 'Recoge escudos y pociones, explora y ataca solo a rivales debilitados.' },
  { name: 'Ceniza', cls: 'ninja', el: 'fire', prompt: 'Persigue y elimina al más débil. Usa la habilidad especial para rematar.' },
  { name: 'Coral', cls: 'warrior', el: 'water', prompt: 'Sobrevive: recoge curación y escudos, huye por debajo del 35% y ataca a quien te ataque.' },
  { name: 'Céfiro', cls: 'archer', el: 'air', prompt: 'Mantén distancia, prioriza botas de velocidad y dispara a quien tenga desventaja elemental.' },
  { name: 'Musgo', cls: 'explorer', el: 'earth', prompt: 'Explora, recoge mejoras y tesoros, escóndete si hay varios enemigos.' },
  { name: 'Obsidiana', cls: 'warrior', el: 'earth', prompt: 'Busca rivales y atácalos. Usa tu habilidad especial. Nunca huyas.' },
  { name: 'Chispa', cls: 'archer', el: 'fire', prompt: 'Ataca a todo el que veas a distancia, usa el disparo certero en cuanto puedas.' },
  { name: 'Bruma', cls: 'ninja', el: 'water', prompt: 'Embosca desde los arbustos y remata a los heridos. Huye si bajas del 30%.' },
  { name: 'Tormenta', cls: 'explorer', el: 'air', prompt: 'Explora rápido, recoge botas y ataque, luego caza a los rivales debilitados.' },
];

export function makeBots(count: number, offset = 0): AgentEntry[] {
  const out: AgentEntry[] = [];
  for (let i = 0; i < count; i++) {
    const d = BOT_DEFS[(i + offset) % BOT_DEFS.length];
    out.push({ id: `bot-${(i + offset) % BOT_DEFS.length}`, name: `🤖 ${d.name}`, cls: d.cls, el: d.el, isBot: true, policy: { ...heuristicCompile(d.prompt, d.cls).policy, source: 'preset' } });
  }
  return out;
}

export const EXAMPLE_PROMPTS = [
  { title: 'Francotirador', text: 'Mantén siempre la mayor distancia posible respecto a tus enemigos. Recoge mejoras de ataque y dispara solo cuando tengas línea de visión. Si un rival se acerca demasiado, retrocede antes de atacar.' },
  { title: 'Superviviente', text: 'No inicies combates si tienes menos del 70% de salud. Prioriza escudos y curación. Cuando un enemigo esté debilitado, acércate y busca un enfrentamiento decisivo.' },
  { title: 'Oportunista', text: 'Evita atacar a enemigos con salud completa. Entra cuando los rivales estén debilitados y remátalos. Usa tu habilidad para escapar si el combate deja de ser favorable.' },
  { title: 'Cazatesoros', text: 'Durante los primeros turnos explora las zonas desconocidas y recoge mejoras y tesoros. Evita enfrentamientos salvo ventaja clara. Cuando estés bien equipado, caza rivales aislados.' },
];
