import { Rng } from './rng';
import { ADVANTAGE_MULT, BEATS, CLASSES, DISADVANTAGE_MULT, TUNING, type ClassStats } from './rules';
import {
  FLAG_BOOTS, FLAG_BURN, FLAG_DEFEND, FLAG_HIDDEN, FLAG_SWORD,
  type Action, type AgentEntry, type AgentResult, type AgentSnap, type Condition, type Decision, type Fact,
  type Frame, type GameEvent, type ItemState, type ItemType, type MatchConfig, type Replay, type Rule,
  type Target, type Tile,
} from './types';

export const DEFAULT_CONFIG: MatchConfig = { width: 20, height: 20, maxTurns: 50, zoneStartTurn: 10 };

interface Agent {
  idx: number;
  entry: AgentEntry;
  st: ClassStats;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  cd: number;
  burn: number;
  burnBy: number;
  boots: number;
  sword: number;
  defending: boolean;
  lastAttacker: number;
  seen: Uint8Array;
  r: AgentResult;
  deathTurn: number;
  treasurePoints: number;
  tb: number; // desempate aleatorio por partida (evita sesgos por orden de inscripción)
}

interface Zone {
  cx: number;
  cy: number;
  r: number;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const cheb = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function simulate(matchId: string, seed: number, entries: AgentEntry[], cfg: MatchConfig = DEFAULT_CONFIG): Replay {
  const t0 = Date.now();
  const rng = new Rng(seed);
  const W = cfg.width;
  const H = cfg.height;
  const tiles = generateMap(rng, W, H);
  const at = (x: number, y: number): Tile => (x < 0 || y < 0 || x >= W || y >= H ? 1 : tiles[y * W + x]);
  const walkable = (x: number, y: number) => at(x, y) !== 1;

  // --- agentes y posiciones iniciales repartidas en un anillo ---
  const spawns = rng.shuffle(spawnPoints(rng, tiles, W, H, entries.length));
  const agents: Agent[] = entries.map((e, idx) => {
    const st = CLASSES[e.cls];
    const [x, y] = spawns[idx];
    return {
      idx, entry: e, st, x, y, hp: st.hp, maxHp: st.hp, shield: 0, alive: true, cd: 2, burn: 0, burnBy: -1,
      boots: 0, sword: 0, defending: false, lastAttacker: -1, seen: new Uint8Array(W * H), deathTurn: -1,
      treasurePoints: 0, tb: rng.next(),
      r: {
        agentId: e.id, place: 0, score: 0, kills: 0, damageDealt: 0, damageTaken: 0, items: 0, treasures: 0,
        survivedTurns: 0, killedBy: null, deathCause: null, ruleFires: e.policy.rules.map(() => 0),
        instinctFires: 0, defaultFires: 0, specialsUsed: 0,
      },
    };
  });

  const zone: Zone = {
    cx: Math.floor(W / 2) + rng.int(5) - 2,
    cy: Math.floor(H / 2) + rng.int(5) - 2,
    r: Math.ceil(Math.hypot(W, H)),
  };
  const inZone = (x: number, y: number) => Math.hypot(x - zone.cx, y - zone.cy) <= zone.r;

  // --- objetos ---
  let itemSeq = 1;
  const items: ItemState[] = [];
  const itemWeights: [ItemType, number][] = [
    ['potion', 25], ['shield', 18], ['boots', 12], ['sword', 15], ['orb', 12], ['treasure', 18],
  ];
  const randomItemType = (allowTreasure = true): ItemType => {
    const pool = allowTreasure ? itemWeights : itemWeights.filter(([t]) => t !== 'treasure');
    let n = rng.int(pool.reduce((s, [, w]) => s + w, 0));
    for (const [t, w] of pool) {
      if ((n -= w) < 0) return t;
    }
    return 'potion';
  };
  const occupiedByAgent = (x: number, y: number, except?: Agent) =>
    agents.some((a) => a.alive && a !== except && a.x === x && a.y === y);
  const itemAt = (x: number, y: number) => items.findIndex((i) => i.x === x && i.y === y);
  const placeRandomItem = (events: GameEvent[] | null, insideZone: boolean) => {
    for (let tries = 0; tries < 60; tries++) {
      const x = rng.int(W);
      const y = rng.int(H);
      if (at(x, y) === 1 || occupiedByAgent(x, y) || itemAt(x, y) >= 0) continue;
      if (insideZone && !inZone(x, y)) continue;
      const it: ItemState = { id: itemSeq++, x, y, type: randomItemType() };
      items.push(it);
      events?.push({ k: 'spawn', item: it.type, x, y });
      return;
    }
  };
  const initialItems = Math.round(entries.length * 1.5) + 4;
  for (let i = 0; i < initialItems; i++) placeRandomItem(null, false);

  // --- utilidades espaciales ---
  const los = (ax: number, ay: number, bx: number, by: number): boolean => {
    let x = ax, y = ay;
    const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx + dy;
    while (!(x === bx && y === by)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      if (x === bx && y === by) break;
      if (at(x, y) === 1) return false;
    }
    return true;
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => cheb(a.x, a.y, b.x, b.y);
  const canSee = (a: Agent, b: Agent) => {
    if (!b.alive || a === b) return false;
    const d = dist(a, b);
    if (d > a.st.vision) return false;
    if (at(b.x, b.y) === 2 && d > 1) return false;
    return los(a.x, a.y, b.x, b.y);
  };
  const canHit = (a: Agent, b: Agent, rangeBonus = 0) => {
    const d = dist(a, b);
    return d <= a.st.range + rangeBonus && (d <= 1 || los(a.x, a.y, b.x, b.y));
  };

  /** BFS desde el agente; devuelve el camino (sin la casilla inicial) a la casilla más cercana que cumpla isGoal. */
  const pathTo = (a: Agent, isGoal: (x: number, y: number) => boolean, maxDepth = W * H): [number, number][] | null => {
    const prev = new Int32Array(W * H).fill(-2);
    const start = a.y * W + a.x;
    prev[start] = -1;
    const queue = [start];
    const depth = new Int16Array(W * H);
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const cx = cur % W, cy = (cur / W) | 0;
      if (cur !== start && isGoal(cx, cy)) {
        const path: [number, number][] = [];
        for (let p = cur; p !== start; p = prev[p]) path.push([p % W, (p / W) | 0]);
        return path.reverse();
      }
      if (depth[cur] >= maxDepth) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(nx, ny)) continue;
        const n = ny * W + nx;
        if (prev[n] !== -2) continue;
        if (occupiedByAgent(nx, ny, a)) continue;
        prev[n] = cur;
        depth[n] = depth[cur] + 1;
        queue.push(n);
      }
    }
    return null;
  };

  /** Casillas alcanzables en <= steps movimientos (incluida la actual). */
  const reachable = (a: Agent, steps: number): [number, number][] => {
    const seen = new Set<number>([a.y * W + a.x]);
    let frontier: [number, number][] = [[a.x, a.y]];
    const out: [number, number][] = [[a.x, a.y]];
    for (let s = 0; s < steps; s++) {
      const next: [number, number][] = [];
      for (const [x, y] of frontier) {
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy;
          const k = ny * W + nx;
          if (!walkable(nx, ny) || seen.has(k) || occupiedByAgent(nx, ny, a)) continue;
          seen.add(k);
          next.push([nx, ny]);
          out.push([nx, ny]);
        }
      }
      frontier = next;
    }
    return out;
  };

  const moveSteps = (a: Agent, t: number) => a.st.move + (a.boots > 0 ? 1 : 0) + (a.entry.el === 'air' && t % TUNING.airExtraMoveEvery === 0 ? 1 : 0);

  // --- estado del turno ---
  let turn = 0;
  let events: GameEvent[] = [];

  const pickup = (a: Agent) => {
    const i = itemAt(a.x, a.y);
    if (i < 0) return;
    const it = items[i];
    items.splice(i, 1);
    const m = a.entry.cls === 'explorer' ? TUNING.explorerItemMult : 1;
    a.r.items++;
    switch (it.type) {
      case 'potion': {
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + Math.round(TUNING.potionHeal * m));
        events.push({ k: 'heal', a: a.idx, amount: a.hp - before, src: 'potion' });
        break;
      }
      case 'shield': a.shield += Math.round(TUNING.shieldAmount * m); break;
      case 'boots': a.boots = Math.round(TUNING.bootsTurns * m); break;
      case 'sword': a.sword = Math.round(TUNING.swordTurns * m); break;
      case 'orb': a.cd = 0; break;
      case 'treasure': a.r.treasures++; a.treasurePoints += Math.round(TUNING.treasurePoints * m); break;
    }
    events.push({ k: 'pickup', a: a.idx, item: it.type, x: it.x, y: it.y });
  };

  const moveTo = (a: Agent, x: number, y: number) => {
    if (a.x === x && a.y === y) return;
    a.x = x;
    a.y = y;
    events.push({ k: 'move', a: a.idx, x, y });
    pickup(a);
  };
  const followPath = (a: Agent, path: [number, number][] | null, steps: number) => {
    if (!path || path.length === 0) return;
    // recogemos objetos por el camino, no solo en la casilla final
    for (let i = 0; i < Math.min(steps, path.length); i++) {
      a.x = path[i][0];
      a.y = path[i][1];
      if (itemAt(a.x, a.y) >= 0) pickup(a);
    }
    events.push({ k: 'move', a: a.idx, x: a.x, y: a.y });
  };

  const kill = (victim: Agent, by: Agent | null, cause: 'agent' | 'zone' | 'burn') => {
    victim.alive = false;
    victim.hp = 0;
    victim.deathTurn = turn;
    victim.r.survivedTurns = turn;
    victim.r.deathCause = cause;
    if (by) {
      by.r.kills++;
      victim.r.killedBy = by.entry.id;
    }
    events.push({ k: 'death', a: victim.idx, by: by ? by.idx : null, cause });
    // el caído suelta un objeto: genera dinámicas de saqueo
    if (itemAt(victim.x, victim.y) < 0) {
      const it: ItemState = { id: itemSeq++, x: victim.x, y: victim.y, type: randomItemType(false) };
      items.push(it);
      events.push({ k: 'spawn', item: it.type, x: it.x, y: it.y });
    }
  };

  const applyDamage = (target: Agent, raw: number, by: Agent | null): number => {
    let dmg = raw;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, dmg);
      target.shield -= absorbed;
      dmg -= absorbed;
    }
    target.hp -= dmg;
    target.r.damageTaken += raw;
    if (by) by.r.damageDealt += raw;
    return raw;
  };

  const strike = (a: Agent, t: Agent, mult: number, special: boolean, ignoreDodge = false) => {
    if (!t.alive) return;
    const dodge = t.st.dodge + (t.entry.el === 'air' ? TUNING.airDodge : 0);
    if (!ignoreDodge && rng.chance(dodge)) {
      events.push({ k: 'attack', a: a.idx, t: t.idx, dmg: 0, special, dodged: true });
      return;
    }
    let dmg = (a.st.atk + (a.sword > 0 ? TUNING.swordBonus : 0) + (a.entry.el === 'fire' ? TUNING.fireAtkBonus : 0)) * mult;
    dmg *= 1 + (rng.next() * 2 - 1) * TUNING.variance;
    let adv = false;
    if (BEATS[a.entry.el] === t.entry.el) { dmg *= ADVANTAGE_MULT; adv = true; }
    else if (BEATS[t.entry.el] === a.entry.el) dmg *= DISADVANTAGE_MULT;
    if (a.entry.cls === 'archer' && !special && dist(a, t) <= 1) dmg *= TUNING.archerMeleeMult;
    dmg -= t.st.armor;
    if (t.entry.el === 'earth') dmg -= TUNING.earthReduction;
    if (t.defending) dmg *= TUNING.defendMult;
    const final = Math.max(1, Math.round(dmg));
    applyDamage(t, final, a);
    t.lastAttacker = a.idx;
    if (a.entry.el === 'fire') { t.burn = TUNING.burnTurns; t.burnBy = a.idx; }
    events.push({ k: 'attack', a: a.idx, t: t.idx, dmg: final, special: special || undefined, adv: adv || undefined });
    if (t.hp <= 0) kill(t, a, 'agent');
  };

  // --- percepción ---
  interface Obs {
    enemies: Agent[];
    items: ItemState[]; // ordenados por preferencia
  }
  const observe = (a: Agent): Obs => {
    for (let y = Math.max(0, a.y - a.st.vision); y <= Math.min(H - 1, a.y + a.st.vision); y++) {
      for (let x = Math.max(0, a.x - a.st.vision); x <= Math.min(W - 1, a.x + a.st.vision); x++) a.seen[y * W + x] = 1;
    }
    const enemies = agents.filter((b) => canSee(a, b));
    const pri = a.entry.policy.itemPriority;
    const useless = (type: ItemType) =>
      (type === 'potion' && a.hp >= a.maxHp * 0.95) || (type === 'shield' && a.shield >= 25) || (type === 'orb' && a.cd === 0);
    const vis = items
      .filter((i) => cheb(a.x, a.y, i.x, i.y) <= a.st.itemVision)
      .map((i) => {
        const p = pri.indexOf(i.type);
        const rank = (p < 0 ? pri.length + 1 : p) * 3 + cheb(a.x, a.y, i.x, i.y) + (useless(i.type) ? 50 : 0);
        return { i, rank };
      })
      .sort((p, q) => p.rank - q.rank || p.i.id - q.i.id)
      .map((p) => p.i);
    return { enemies, items: vis };
  };

  const selectTarget = (a: Agent, sel: Target, enemies: Agent[]): Agent | null => {
    if (enemies.length === 0) return null;
    const nearest = () => [...enemies].sort((p, q) => dist(a, p) - dist(a, q) || p.tb - q.tb)[0];
    switch (sel) {
      case 'nearest': return nearest();
      case 'weakest': return [...enemies].sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp || dist(a, p) - dist(a, q) || p.tb - q.tb)[0];
      case 'strongest': return [...enemies].sort((p, q) => q.hp - p.hp || dist(a, p) - dist(a, q) || p.tb - q.tb)[0];
      case 'advantage': {
        const fav = enemies.filter((e) => BEATS[a.entry.el] === e.entry.el);
        return fav.length ? [...fav].sort((p, q) => dist(a, p) - dist(a, q) || p.tb - q.tb)[0] : nearest();
      }
      case 'lastAttacker': return enemies.find((e) => e.idx === a.lastAttacker) ?? nearest();
    }
  };

  const factValue = (a: Agent, f: Fact, obs: Obs, target: Agent | null): number | undefined => {
    switch (f) {
      case 'self.hp': return (a.hp / a.maxHp) * 100;
      case 'self.shield': return a.shield;
      case 'self.specialReady': return a.cd === 0 ? 1 : 0;
      case 'self.kills': return a.r.kills;
      case 'enemies.visible': return obs.enemies.length;
      case 'enemies.inRange': return obs.enemies.filter((e) => canHit(a, e)).length;
      case 'enemy.distance': return target ? dist(a, target) : undefined;
      case 'enemy.hp': return target ? (target.hp / target.maxHp) * 100 : undefined;
      case 'enemy.advantage':
        if (!target) return undefined;
        return BEATS[a.entry.el] === target.entry.el ? 1 : BEATS[target.entry.el] === a.entry.el ? -1 : 0;
      case 'items.visible': return obs.items.length;
      case 'item.distance': return obs.items.length ? cheb(a.x, a.y, obs.items[0].x, obs.items[0].y) : undefined;
      case 'turn': return turn;
      case 'zone.outside': return inZone(a.x, a.y) ? 0 : 1;
    }
  };

  const holds = (a: Agent, c: Condition, obs: Obs, target: Agent | null): boolean => {
    const v = factValue(a, c.fact, obs, target);
    if (v === undefined) return false;
    switch (c.op) {
      case '<': return v < c.value;
      case '<=': return v <= c.value;
      case '>': return v > c.value;
      case '>=': return v >= c.value;
      case '==': return Math.abs(v - c.value) < 1e-9;
    }
  };

  const nearestBush = (a: Agent) => pathTo(a, (x, y) => at(x, y) === 2 && inZone(x, y), 8);

  const feasible = (a: Agent, action: Action, target: Agent | null, obs: Obs): boolean => {
    switch (action) {
      case 'attack':
      case 'approach':
      case 'kite':
        return !!target;
      case 'special':
        if (a.cd > 0) return false;
        switch (a.entry.cls) {
          case 'archer': return !!target && canHit(a, target, 1);
          case 'warrior': return !!target && dist(a, target) <= 2;
          case 'ninja': return !!target && dist(a, target) <= 5;
          case 'explorer': return a.hp < a.maxHp * 0.9 || a.shield === 0;
        }
        return false;
      case 'flee': return obs.enemies.length > 0;
      case 'collect': return obs.items.length > 0;
      case 'hide': return at(a.x, a.y) === 2 || !!nearestBush(a);
      case 'explore':
      case 'defend':
      case 'center':
        return true;
    }
  };

  // --- ejecución de acciones ---
  const approachRange = (a: Agent, t: Agent, range: number, steps: number) => {
    if (dist(a, t) <= range && (dist(a, t) <= 1 || los(a.x, a.y, t.x, t.y))) return;
    const path = pathTo(a, (x, y) => {
      const d = cheb(x, y, t.x, t.y);
      return d <= range && (d <= 1 || los(x, y, t.x, t.y));
    });
    followPath(a, path, steps);
  };

  const flee = (a: Agent, enemies: Agent[], steps: number) => {
    const opts = reachable(a, steps);
    let best = opts[0];
    let bestScore = -Infinity;
    for (const [x, y] of opts) {
      const minD = Math.min(...enemies.map((e) => cheb(x, y, e.x, e.y)));
      const score = minD * 10 + (inZone(x, y) ? 6 : -25) + (at(x, y) === 2 ? 3 : 0);
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    if (best[0] !== a.x || best[1] !== a.y) {
      a.x = best[0];
      a.y = best[1];
      events.push({ k: 'move', a: a.idx, x: a.x, y: a.y });
      pickup(a);
    }
  };

  const explore = (a: Agent, steps: number) => {
    let path = pathTo(a, (x, y) => !a.seen[y * W + x] && inZone(x, y));
    if (!path) path = pathTo(a, (x, y) => cheb(x, y, zone.cx, zone.cy) <= 1);
    if (!path) {
      const opts = reachable(a, 1).filter(([x, y]) => inZone(x, y));
      if (opts.length) {
        const [x, y] = rng.pick(opts);
        moveTo(a, x, y);
      }
      return;
    }
    followPath(a, path, steps);
  };

  const goCenter = (a: Agent, steps: number) => {
    const path = pathTo(a, (x, y) => Math.hypot(x - zone.cx, y - zone.cy) <= Math.max(1, zone.r - 1));
    followPath(a, path, steps);
  };

  const useSpecial = (a: Agent, t: Agent | null, obs: Obs) => {
    a.cd = a.st.specialCd + 1; // +1 porque se descuenta al final de este mismo turno
    a.r.specialsUsed++;
    switch (a.entry.cls) {
      case 'archer':
        if (t) strike(a, t, 2.0, true, true);
        break;
      case 'warrior':
        if (t) {
          if (dist(a, t) > 1) approachRange(a, t, 1, 1);
          if (dist(a, t) <= 1) strike(a, t, 2.3, true);
        }
        break;
      case 'ninja':
        if (t) {
          // teletransporte a una casilla libre junto al objetivo
          const spots: [number, number][] = [];
          for (const [dx, dy] of DIRS) {
            const x = t.x + dx, y = t.y + dy;
            if (walkable(x, y) && !occupiedByAgent(x, y, a)) spots.push([x, y]);
          }
          if (spots.length) {
            spots.sort((p, q) => cheb(p[0], p[1], a.x, a.y) - cheb(q[0], q[1], a.x, a.y));
            a.x = spots[0][0];
            a.y = spots[0][1];
            events.push({ k: 'dash', a: a.idx, x: a.x, y: a.y });
            pickup(a);
          }
          if (dist(a, t) <= 1) strike(a, t, 1.7, true);
        }
        break;
      case 'explorer': {
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + 15);
        a.shield += 10;
        events.push({ k: 'heal', a: a.idx, amount: a.hp - before, src: 'special' });
        // si hay alguien a tiro, aprovecha para atacar
        if (t && canHit(a, t)) strike(a, t, 1, false);
        break;
      }
    }
    void obs;
  };

  const execute = (a: Agent, action: Action, target: Agent | null, obs: Obs) => {
    const steps = moveSteps(a, turn);
    switch (action) {
      case 'attack':
        if (!target) return;
        if (!canHit(a, target)) approachRange(a, target, a.st.range, steps);
        if (canHit(a, target)) strike(a, target, 1, false);
        return;
      case 'approach':
        if (target) approachRange(a, target, 1, steps);
        return;
      case 'kite': {
        if (!target) return;
        const d = dist(a, target);
        if (d < a.st.range) {
          // retroceder manteniendo línea de tiro
          const opts = reachable(a, steps);
          let best = opts[0];
          let bestScore = -Infinity;
          for (const [x, y] of opts) {
            const dd = cheb(x, y, target.x, target.y);
            const score = -Math.abs(dd - a.st.range) * 10 + (dd <= a.st.range && los(x, y, target.x, target.y) ? 8 : 0) + (inZone(x, y) ? 4 : -25);
            if (score > bestScore) { bestScore = score; best = [x, y]; }
          }
          moveTo(a, best[0], best[1]);
        } else if (!canHit(a, target)) {
          approachRange(a, target, a.st.range, steps);
        }
        if (canHit(a, target)) strike(a, target, 1, false);
        return;
      }
      case 'special':
        useSpecial(a, target, obs);
        return;
      case 'flee':
        if (a.entry.cls === 'ninja' && a.cd === 0) {
          // Sombra fugaz como huida: salto de hasta 4 casillas lejos de las amenazas
          let best: [number, number] | null = null;
          let bestScore = -Infinity;
          for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
            const x = a.x + dx, y = a.y + dy;
            if (!walkable(x, y) || occupiedByAgent(x, y, a)) continue;
            const minD = Math.min(...obs.enemies.map((e) => cheb(x, y, e.x, e.y)));
            const score = minD * 10 + (inZone(x, y) ? 6 : -25);
            if (score > bestScore) { bestScore = score; best = [x, y]; }
          }
          if (best) {
            a.cd = a.st.specialCd + 1;
            a.r.specialsUsed++;
            a.x = best[0];
            a.y = best[1];
            events.push({ k: 'dash', a: a.idx, x: a.x, y: a.y });
            pickup(a);
            return;
          }
        }
        flee(a, obs.enemies, steps);
        return;
      case 'collect': {
        const it = obs.items[0];
        if (!it) return;
        followPath(a, pathTo(a, (x, y) => x === it.x && y === it.y), steps);
        return;
      }
      case 'explore':
        explore(a, steps);
        return;
      case 'hide':
        if (at(a.x, a.y) === 2) a.defending = true;
        else followPath(a, nearestBush(a), steps);
        return;
      case 'defend':
        a.defending = true;
        return;
      case 'center':
        goCenter(a, steps);
        return;
    }
  };

  const decideAndAct = (a: Agent, decisions: Decision[]) => {
    const obs = observe(a);
    const policy = a.entry.policy;
    // Instinto de supervivencia común a todos: volver a la zona segura.
    if (!inZone(a.x, a.y)) {
      a.r.instinctFires++;
      decisions.push([a.idx, -1, 'center']);
      execute(a, 'center', null, obs);
      return;
    }
    for (let i = 0; i < policy.rules.length; i++) {
      const rule: Rule = policy.rules[i];
      const target = selectTarget(a, rule.target, obs.enemies);
      if (!rule.when.every((c) => holds(a, c, obs, target))) continue;
      if (!feasible(a, rule.do, target, obs)) continue;
      a.r.ruleFires[i]++;
      decisions.push([a.idx, i, rule.do]);
      execute(a, rule.do, target, obs);
      return;
    }
    const target = selectTarget(a, 'nearest', obs.enemies);
    const action = feasible(a, policy.defaultAction, target, obs) ? policy.defaultAction : 'explore';
    a.r.defaultFires++;
    decisions.push([a.idx, -2, action]);
    execute(a, action, target, obs);
  };

  const snapshot = (): AgentSnap[] =>
    agents.map((a) => [
      a.x, a.y, Math.max(0, Math.round(a.hp)), a.shield, a.alive ? 1 : 0,
      (a.defending ? FLAG_DEFEND : 0) | (at(a.x, a.y) === 2 ? FLAG_HIDDEN : 0) | (a.burn > 0 ? FLAG_BURN : 0) |
        (a.boots > 0 ? FLAG_BOOTS : 0) | (a.sword > 0 ? FLAG_SWORD : 0),
    ]);

  const frames: Frame[] = [
    { t: 0, zone: { ...zone, r: Math.min(zone.r, 99) }, agents: snapshot(), items: items.map((i) => ({ ...i })), events: [], decisions: [] },
  ];

  // --- bucle principal ---
  const aliveCount = () => agents.filter((a) => a.alive).length;
  for (turn = 1; turn <= cfg.maxTurns && aliveCount() > 1; turn++) {
    events = [];
    const decisions: Decision[] = [];

    if (turn >= cfg.zoneStartTurn) {
      const target = Math.max(TUNING.zoneMinRadius, Math.ceil(Math.hypot(W, H) / 2) - Math.floor((turn - cfg.zoneStartTurn) * 0.75));
      zone.r = Math.min(zone.r, target);
    }

    for (const a of agents) a.defending = false;
    const order = rng.shuffle(agents.filter((a) => a.alive));
    for (const a of order) if (a.alive) decideAndAct(a, decisions);

    // efectos de final de turno
    for (const a of agents) {
      if (!a.alive) continue;
      if (a.burn > 0) {
        a.burn--;
        const by = agents[a.burnBy] ?? null;
        applyDamage(a, TUNING.burnDmg, by);
        events.push({ k: 'burn', a: a.idx, dmg: TUNING.burnDmg });
        if (a.hp <= 0) { kill(a, by && by.alive ? by : by, 'burn'); continue; }
      }
      if (!inZone(a.x, a.y)) {
        const dmg = TUNING.zoneDmgBase + Math.round(Math.max(0, turn - cfg.zoneStartTurn) * TUNING.zoneDmgRamp);
        applyDamage(a, dmg, null);
        events.push({ k: 'zone', a: a.idx, dmg });
        if (a.hp <= 0) { kill(a, null, 'zone'); continue; }
      }
      if (a.entry.el === 'water' && a.hp < a.maxHp) {
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + TUNING.waterRegen);
        if (a.hp > before) events.push({ k: 'heal', a: a.idx, amount: a.hp - before, src: 'water' });
      }
      if (a.cd > 0) a.cd--;
      if (a.boots > 0) a.boots--;
      if (a.sword > 0) a.sword--;
    }

    if (turn % TUNING.itemRespawnEvery === 0) {
      placeRandomItem(events, true);
      placeRandomItem(events, true);
    }
    // los objetos fuera de la zona se pierden: obliga a moverse
    for (let i = items.length - 1; i >= 0; i--) if (!inZone(items[i].x, items[i].y) && turn >= cfg.zoneStartTurn) items.splice(i, 1);

    frames.push({
      t: turn, zone: { cx: zone.cx, cy: zone.cy, r: Math.min(zone.r, 99) }, agents: snapshot(),
      items: items.map((i) => ({ ...i })), events, decisions,
    });
  }
  const lastTurn = turn - 1;

  // --- resultados ---
  for (const a of agents) {
    if (a.alive) a.r.survivedTurns = lastTurn;
    a.r.score =
      a.r.kills * TUNING.scoreKill + a.r.items * TUNING.scoreItem + a.treasurePoints + a.r.survivedTurns * TUNING.scorePerTurn +
      Math.round(a.r.damageDealt * 0.5);
  }
  const alive = agents.filter((a) => a.alive).sort((p, q) => q.r.score - p.r.score || q.hp - p.hp || p.tb - q.tb);
  const dead = agents.filter((a) => !a.alive).sort((p, q) => q.deathTurn - p.deathTurn || q.r.score - p.r.score || p.tb - q.tb);
  const ranking = [...alive, ...dead];
  if (ranking.length) ranking[0].r.score += TUNING.scoreWin;
  ranking.forEach((a, i) => (a.r.place = i + 1));

  return {
    version: 1,
    matchId,
    seed,
    width: W,
    height: H,
    tiles,
    agents: agents.map((a) => ({
      id: a.entry.id, name: a.entry.name, cls: a.entry.cls, el: a.entry.el, isBot: !!a.entry.isBot, maxHp: a.maxHp,
      summary: a.entry.policy.summary, rules: a.entry.policy.rules.map((r) => r.label), defaultAction: a.entry.policy.defaultAction,
    })),
    frames,
    results: ranking.map((a) => a.r),
    winnerId: ranking[0]?.entry.id ?? null,
    turns: lastTurn,
    simMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Generación del mapa
// ---------------------------------------------------------------------------

function generateMap(rng: Rng, W: number, H: number): Tile[] {
  const tiles: Tile[] = new Array(W * H).fill(0);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const blob = (type: Tile, clusters: number, minLen: number, maxLen: number) => {
    for (let c = 0; c < clusters; c++) {
      let x = rng.int(W), y = rng.int(H);
      const len = minLen + rng.int(maxLen - minLen + 1);
      for (let i = 0; i < len; i++) {
        if (Math.abs(x - cx) > 1 || Math.abs(y - cy) > 1) tiles[y * W + x] = type;
        const [dx, dy] = DIRS[rng.int(4)];
        x = Math.min(W - 1, Math.max(0, x + dx));
        y = Math.min(H - 1, Math.max(0, y + dy));
      }
    }
  };
  blob(1, Math.round((W * H) / 40), 3, 6);
  blob(2, Math.round((W * H) / 55), 3, 5);
  // conectividad: todo lo que no se alcanza desde el centro pasa a ser muro
  const seen = new Uint8Array(W * H);
  const q = [cy * W + cx];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const x = cur % W, y = (cur / W) | 0;
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (seen[n] || tiles[n] === 1) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  for (let i = 0; i < tiles.length; i++) if (!seen[i]) tiles[i] = 1;
  return tiles;
}

function spawnPoints(rng: Rng, tiles: Tile[], W: number, H: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  const radius = Math.min(W, H) / 2 - 2;
  const offset = rng.next() * Math.PI * 2;
  const taken = new Set<number>();
  for (let i = 0; i < n; i++) {
    const ang = offset + (i / n) * Math.PI * 2;
    const tx = Math.round(W / 2 + Math.cos(ang) * radius);
    const ty = Math.round(H / 2 + Math.sin(ang) * radius);
    // casilla libre más cercana
    let best: [number, number] = [Math.floor(W / 2), Math.floor(H / 2)];
    let bestD = Infinity;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tiles[y * W + x] === 1 || taken.has(y * W + x)) continue;
      const d = Math.abs(x - tx) + Math.abs(y - ty);
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    taken.add(best[1] * W + best[0]);
    out.push(best);
  }
  return out;
}
