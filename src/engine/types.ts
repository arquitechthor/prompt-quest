// Tipos compartidos por el motor, el backend y el frontend.
// El motor es una función pura: (semilla, agentes, políticas) -> replay.

export type ClassId = 'archer' | 'warrior' | 'ninja' | 'explorer';
export type ElementId = 'fire' | 'water' | 'earth' | 'air';
export type ItemType = 'potion' | 'shield' | 'boots' | 'sword' | 'orb' | 'treasure';

/** 0 = suelo, 1 = muro, 2 = arbusto (oculta al agente salvo a distancia 1). */
export type Tile = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Política: el "programa" que el LLM genera a partir del prompt del jugador.
// Es datos, nunca código: el motor solo interpreta este vocabulario cerrado.
// ---------------------------------------------------------------------------

export const FACTS = [
  'self.hp', // % de salud propia (0-100)
  'self.shield', // puntos de escudo
  'self.specialReady', // 1 si la habilidad especial está lista
  'self.kills', // eliminaciones conseguidas
  'enemies.visible', // nº de enemigos visibles
  'enemies.inRange', // nº de enemigos a tiro
  'enemy.distance', // distancia al objetivo de la regla
  'enemy.hp', // % de salud del objetivo de la regla
  'enemy.advantage', // 1 si tengo ventaja elemental sobre el objetivo, -1 si desventaja, 0 neutro
  'items.visible', // nº de objetos visibles
  'item.distance', // distancia al objeto preferido más cercano
  'turn', // turno actual
  'zone.outside', // 1 si estoy fuera de la zona segura
] as const;
export type Fact = (typeof FACTS)[number];

export const OPS = ['<', '<=', '>', '>=', '=='] as const;
export type Op = (typeof OPS)[number];

export const ACTIONS = [
  'attack', // atacar al objetivo (si no está a tiro, acercarse)
  'special', // usar la habilidad especial
  'approach', // acercarse al objetivo
  'flee', // alejarse de las amenazas
  'kite', // mantener la distancia de ataque y disparar
  'collect', // ir a por el objeto preferido
  'explore', // explorar zonas no vistas
  'hide', // ir al arbusto más cercano
  'defend', // defenderse (reduce el daño este turno)
  'center', // moverse hacia el centro de la zona segura
] as const;
export type Action = (typeof ACTIONS)[number];

export const TARGETS = ['nearest', 'weakest', 'strongest', 'advantage', 'lastAttacker'] as const;
export type Target = (typeof TARGETS)[number];

export const ITEM_TYPES: ItemType[] = ['potion', 'shield', 'boots', 'sword', 'orb', 'treasure'];

export interface Condition {
  fact: Fact;
  op: Op;
  value: number;
}

export interface Rule {
  label: string; // explicación corta en lenguaje natural ("Huir si mi salud < 30 %")
  when: Condition[]; // todas deben cumplirse (AND)
  do: Action;
  target: Target;
}

export interface Policy {
  version: 1;
  summary: string; // cómo ha entendido el sistema la estrategia
  rules: Rule[]; // evaluadas en orden de prioridad; gana la primera aplicable
  itemPriority: ItemType[];
  defaultAction: Action;
  traits: { aggression: number; caution: number; greed: number }; // 0-100, solo informativo/visual
  source: 'bedrock' | 'heuristic' | 'preset';
  warnings?: string[]; // p.ej. "Tu prompt pedía volar: esa habilidad no existe"
}

// ---------------------------------------------------------------------------
// Entrada y salida del motor
// ---------------------------------------------------------------------------

export interface AgentEntry {
  id: string;
  name: string;
  cls: ClassId;
  el: ElementId;
  policy: Policy;
  isBot?: boolean;
}

export interface MatchConfig {
  width: number;
  height: number;
  maxTurns: number;
  zoneStartTurn: number;
}

export interface ItemState {
  id: number;
  x: number;
  y: number;
  type: ItemType;
}

/** Snapshot compacto por agente y turno: [x, y, hp, shield, alive(0/1), flags]. */
export type AgentSnap = [number, number, number, number, number, number];
export const FLAG_DEFEND = 1;
export const FLAG_HIDDEN = 2;
export const FLAG_BURN = 4;
export const FLAG_BOOTS = 8;
export const FLAG_SWORD = 16;

export type GameEvent =
  | { k: 'move'; a: number; x: number; y: number }
  | { k: 'attack'; a: number; t: number; dmg: number; special?: boolean; dodged?: boolean; adv?: boolean }
  | { k: 'dash'; a: number; x: number; y: number }
  | { k: 'heal'; a: number; amount: number; src: string }
  | { k: 'pickup'; a: number; item: ItemType; x: number; y: number }
  | { k: 'burn'; a: number; dmg: number }
  | { k: 'zone'; a: number; dmg: number }
  | { k: 'death'; a: number; by: number | null; cause: 'agent' | 'zone' | 'burn' }
  | { k: 'spawn'; item: ItemType; x: number; y: number };

/** Decisión tomada por un agente en un turno: [agentIdx, ruleIdx, action]. ruleIdx -1 = instinto, -2 = acción por defecto. */
export type Decision = [number, number, Action];

export interface Frame {
  t: number;
  zone: { cx: number; cy: number; r: number };
  agents: AgentSnap[];
  items: ItemState[];
  events: GameEvent[];
  decisions: Decision[];
}

export interface AgentResult {
  agentId: string;
  place: number;
  score: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  items: number;
  treasures: number;
  survivedTurns: number;
  killedBy: string | null;
  deathCause: 'agent' | 'zone' | 'burn' | null;
  ruleFires: number[]; // veces que se activó cada regla
  instinctFires: number;
  defaultFires: number;
  specialsUsed: number;
}

export interface ReplayAgent {
  id: string;
  name: string;
  cls: ClassId;
  el: ElementId;
  isBot: boolean;
  maxHp: number;
  summary: string;
  rules: string[];
  defaultAction: Action;
}

export interface Replay {
  version: 1;
  matchId: string;
  seed: number;
  width: number;
  height: number;
  tiles: Tile[];
  agents: ReplayAgent[];
  frames: Frame[];
  results: AgentResult[]; // ordenados por posición final
  winnerId: string | null;
  turns: number;
  simMs: number;
}
