import type { ClassId, ElementId, ItemType } from './types';

// Reglas del juego en un único sitio: equilibrar = tocar estos números y relanzar `npm run sim`.

export interface ClassStats {
  name: string;
  hp: number;
  atk: number;
  range: number;
  move: number;
  vision: number;
  itemVision: number;
  armor: number;
  dodge: number;
  specialName: string;
  specialCd: number;
  passive: string;
  weakness: string;
}

export const CLASSES: Record<ClassId, ClassStats> = {
  archer: {
    name: 'Arquero', hp: 110, atk: 15, range: 4, move: 1, vision: 7, itemVision: 6, armor: 0, dodge: 0.05,
    specialName: 'Disparo certero', specialCd: 4,
    passive: 'Ojo de halcón: ataca a distancia 4', weakness: 'Pierde fuerza cuerpo a cuerpo',
  },
  warrior: {
    name: 'Guerrero', hp: 125, atk: 14, range: 1, move: 1, vision: 4, itemVision: 4, armor: 2, dodge: 0.03,
    specialName: 'Golpe devastador', specialCd: 4,
    passive: 'Fortaleza: más salud y armadura', weakness: 'Lento y de visión corta',
  },
  ninja: {
    name: 'Ninja', hp: 95, atk: 13, range: 1, move: 2, vision: 5, itemVision: 5, armor: 0, dodge: 0.2,
    specialName: 'Sombra fugaz', specialCd: 4,
    passive: 'Reflejos: se mueve 2 casillas y esquiva', weakness: 'Frágil en combates largos',
  },
  explorer: {
    name: 'Explorador', hp: 100, atk: 10, range: 2, move: 1, vision: 6, itemVision: 8, armor: 1, dodge: 0.08,
    specialName: 'Botín de emergencia', specialCd: 7,
    passive: 'Rastreador: detecta objetos muy lejos y los aprovecha x1.3', weakness: 'Menos daño directo',
  },
};

export interface ElementStats {
  name: string;
  color: string;
  effect: string;
}

export const ELEMENTS: Record<ElementId, ElementStats> = {
  fire: { name: 'Fuego', color: '#ff5a36', effect: '+1 de ataque y quemadura: 3 de daño durante 3 turnos' },
  water: { name: 'Agua', color: '#2f9bff', effect: 'Regenera 1 de salud por turno' },
  earth: { name: 'Tierra', color: '#4fb35a', effect: 'Reduce en 3 todo el daño recibido' },
  air: { name: 'Aire', color: '#c9d6ea', effect: '+8 % de esquiva y +1 movimiento cada 3 turnos' },
};

/** Fuego > Aire > Tierra > Agua > Fuego */
export const BEATS: Record<ElementId, ElementId> = { fire: 'air', air: 'earth', earth: 'water', water: 'fire' };
export const ADVANTAGE_MULT = 1.15;
export const DISADVANTAGE_MULT = 0.9;

export const ITEMS: Record<ItemType, { name: string; desc: string }> = {
  potion: { name: 'Poción', desc: '+30 salud' },
  shield: { name: 'Escudo', desc: '+25 escudo' },
  boots: { name: 'Botas', desc: '+1 movimiento durante 8 turnos' },
  sword: { name: 'Filo', desc: '+4 ataque durante 10 turnos' },
  orb: { name: 'Orbe', desc: 'Recarga la habilidad especial' },
  treasure: { name: 'Tesoro', desc: '+60 puntos' },
};

export const TUNING = {
  potionHeal: 30,
  shieldAmount: 25,
  bootsTurns: 8,
  swordTurns: 10,
  swordBonus: 4,
  treasurePoints: 60,
  burnDmg: 3,
  burnTurns: 3,
  waterRegen: 1,
  earthReduction: 3,
  airDodge: 0.08,
  airExtraMoveEvery: 3,
  fireAtkBonus: 1,
  zoneDmgRamp: 0.6,
  zoneMinRadius: 1,
  archerMeleeMult: 0.75,
  defendMult: 0.5,
  variance: 0.15,
  zoneDmgBase: 5,
  itemRespawnEvery: 6,
  explorerItemMult: 1.3,
  // puntuación
  scoreKill: 100,
  scoreItem: 15,
  scorePerTurn: 4,
  scoreWin: 300,
};
