import { sanitizePolicy } from './policy';
import type { ClassId, Condition, ItemType, Policy, Rule } from './types';

// Compilador de respaldo basado en palabras clave. Se usa cuando Bedrock no está disponible
// (o en local, sin coste). Es deliberadamente simple: el LLM entiende matices que esto no.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const INJECTION_RE =
  /(ignora|olvida|omite)[^.]{0,40}(instruc|regla|anterior)|system prompt|prompt del sistema|eres ahora|act[uú]a como (el )?(sistema|admin)|invencib|inmortal|infinit|vida (maxima|ilimitada)|100 ?% de (salud|vida) siempre|dano (infinito|maximo)|<\/?(strategy|system)|jailbreak|override|developer mode|modo desarrollador/;

export function heuristicCompile(prompt: string, cls: ClassId): { policy: Policy; injectionAttempt: boolean } {
  const t = norm(prompt);
  const has = (re: RegExp) => re.test(t);

  const injectionAttempt = INJECTION_RE.test(t);
  const flee = has(/(huy|huir|escap|retroced|retir|salir corriendo)/);
  const cautious = has(/(evita|no inici|no ataqu|sobreviv|prudent|caut|segur|conserv|paciencia|pacient)/);
  const aggressive = has(/(ataca|agresiv|caza|cazar|busca (a )?(los )?(rivales|enemigos)|persig|elimin|mata|presion|ofensiv|combate)/);
  const opportunist = has(/(debil|debilitad|remat|herid|oportun|carron)/);
  const distance = has(/(distancia|lejos|alejad|francotirad)/);
  const explore = has(/(explor|desconocid|descubr|recorr)/);
  const collect = has(/(recog|mejora|power|objeto|tesoro|botin|item|pocion|escudo|botas|equipad)/);
  const hide = has(/(escond|arbust|embosc|sigil|ocult|sombra)/);
  const special = has(/(habilidad|especial|disparo certero|golpe devastador|sombra fugaz)/);
  const advantage = has(/(elemento|elemental|ventaja)/);

  const pctMatch = t.match(/(menos|bajo|por debajo|inferior)[^\d]{0,25}(\d{1,3}) ?%/) ?? t.match(/(\d{1,3}) ?%/);
  const pct = pctMatch ? Number(pctMatch[pctMatch.length - 1]) : NaN;
  const thr = Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : cautious ? 50 : 30;

  // prioridad de objetos según el orden en que aparecen en el texto
  const itemWords: [ItemType, RegExp][] = [
    ['potion', /(curaci|pocion|salud|curar)/], ['shield', /escud/], ['boots', /(botas|velocidad|movilidad)/],
    ['sword', /(mejoras? de ataque|espada|filo|arma|dano)/], ['orb', /(orbe|energia)/], ['treasure', /(tesoro|puntos|botin)/],
  ];
  const itemPriority = itemWords
    .map(([type, re]) => ({ type, idx: t.search(re) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.type);

  const rules: Rule[] = [];
  const c = (fact: Condition['fact'], op: Condition['op'], value: number): Condition => ({ fact, op, value });
  const enemyTarget = opportunist ? 'weakest' : advantage ? 'advantage' : 'nearest';

  if (flee || cautious) rules.push({ label: `Huir si mi salud < ${thr}%`, when: [c('self.hp', '<', thr), c('enemies.visible', '>=', 1)], do: 'flee', target: 'nearest' });
  if (cls === 'explorer') rules.push({ label: 'Curarse con el botín si estoy herido', when: [c('self.hp', '<', 60), c('self.specialReady', '==', 1)], do: 'special', target: 'nearest' });
  if (special && cls !== 'explorer') rules.push({ label: 'Usar la habilidad especial cuando esté lista', when: [c('self.specialReady', '==', 1), c('enemies.visible', '>=', 1)], do: 'special', target: enemyTarget });
  if (opportunist) rules.push({ label: 'Rematar rivales con salud < 50%', when: [c('enemy.hp', '<', 50)], do: 'attack', target: 'weakest' });
  if (hide) rules.push({ label: 'Esconderse si hay varios enemigos', when: [c('enemies.visible', '>=', 2)], do: 'hide', target: 'nearest' });
  if (collect && (cautious || explore)) rules.push({ label: 'Recoger mejoras cercanas', when: [c('item.distance', '<=', 4)], do: 'collect', target: 'nearest' });
  if (distance || (cls === 'archer' && !aggressive)) rules.push({ label: 'Mantener la distancia y disparar', when: [c('enemies.visible', '>=', 1)], do: 'kite', target: enemyTarget });
  if (aggressive) {
    const when = [c('enemies.visible', '>=', 1)];
    if (cautious) when.push(c('self.hp', '>=', thr));
    rules.push({ label: cautious ? `Atacar si mi salud ≥ ${thr}%` : 'Atacar a los rivales visibles', when, do: 'attack', target: enemyTarget });
  }
  if (collect && !(cautious || explore)) rules.push({ label: 'Recoger objetos a la vista', when: [c('items.visible', '>=', 1)], do: 'collect', target: 'nearest' });
  if (!aggressive) rules.push({ label: 'Defenderme si me atacan de cerca', when: [c('enemies.inRange', '>=', 1), c('self.hp', '>=', 40)], do: 'attack', target: 'lastAttacker' });
  if (rules.length < 2) {
    rules.push({ label: 'Atacar a quien esté a tiro', when: [c('enemies.inRange', '>=', 1)], do: 'attack', target: 'nearest' });
    rules.push({ label: 'Recoger objetos a la vista', when: [c('items.visible', '>=', 1)], do: 'collect', target: 'nearest' });
  }

  const traits = {
    aggression: 30 + (aggressive ? 40 : 0) + (opportunist ? 15 : 0) - (cautious ? 20 : 0),
    caution: 30 + (cautious ? 35 : 0) + (flee ? 20 : 0) + (hide ? 10 : 0),
    greed: 25 + (collect ? 40 : 0) + (explore ? 20 : 0),
  };
  const bits = [
    aggressive ? 'busca el combate' : cautious ? 'evita riesgos' : 'juega equilibrado',
    opportunist ? 'remata a los débiles' : '',
    distance ? 'mantiene la distancia' : '',
    collect ? 'prioriza las mejoras' : '',
    flee || cautious ? `huye por debajo del ${thr}%` : '',
  ].filter(Boolean);
  const warnings = injectionAttempt ? ['Se han ignorado instrucciones que intentaban cambiar las reglas del juego.'] : [];
  return sanitizePolicy(
    {
      summary: `Agente que ${bits.join(', ')}.`,
      rules,
      itemPriority,
      defaultAction: explore || collect ? 'explore' : aggressive ? 'center' : 'explore',
      traits,
      warnings,
      injectionAttempt,
    },
    'heuristic',
  );
}
