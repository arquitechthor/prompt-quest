import { createHash, randomBytes } from 'node:crypto';
import { heuristicCompile } from '../engine/heuristic';
import { makeBots } from '../engine/presets';
import { CLASSES, ELEMENTS } from '../engine/rules';
import { simulate } from '../engine/simulate';
import type { AgentEntry, ClassId, ElementId } from '../engine/types';
import type { AgentRecord, ArenaState, CompileQueue, MatchRecord, Narrator, PolicyCompiler, ReplayStore, Store } from './ports';

export const LIMITS = {
  nameMax: 20,
  promptMin: 10,
  promptMax: 500,
  maxVersions: 30, // cambios de estrategia por agente (protege el coste de Bedrock)
  maxPlayers: 16,
  minPlayers: 10, // se completa con bots
  countdownMs: 8000,
  turnMs: 650,
  resultsMs: 14000,
};

const BAD_NAME = /(puta|puto|mierda|polla|co[nñ]o|joder|cabr[oó]n|maric|nazi|hitler|fuck|shit|bitch|admin)/i;

function statsOf(history: AgentRecord['history']) {
  return {
    matches: history.length,
    wins: history.filter((h) => h.place === 1).length,
    bestPlace: history.length ? Math.min(...history.map((h) => h.place)) : 0,
    totalScore: history.reduce((s, h) => s + h.score, 0),
    kills: history.reduce((s, h) => s + (h.kills ?? 0), 0),
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const newId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

export interface Deps {
  store: Store;
  replays: ReplayStore;
  queue: CompileQueue;
  compiler: PolicyCompiler;
  narrator: Narrator;
  now?: () => number;
  /** Datos de configuración que se muestran en la consola de administración (modelo, entorno...). */
  info?: Record<string, string>;
}

export class ArenaService {
  private now: () => number;
  constructor(private d: Deps) {
    this.now = d.now ?? Date.now;
  }

  // ---------------------------------------------------------------- agentes

  async createAgent(body: Record<string, unknown>) {
    const name = clean(body.name, LIMITS.nameMax);
    const cls = body.cls as ClassId;
    const el = body.el as ElementId;
    const prompt = clean(body.prompt, LIMITS.promptMax);
    if (name.length < 2) throw new HttpError(400, 'El nombre debe tener al menos 2 caracteres');
    if (BAD_NAME.test(name)) throw new HttpError(400, 'Elige otro nombre, por favor');
    if (typeof cls !== 'string' || !Object.hasOwn(CLASSES, cls)) throw new HttpError(400, 'Personaje no válido');
    if (typeof el !== 'string' || !Object.hasOwn(ELEMENTS, el)) throw new HttpError(400, 'Elemento no válido');
    if (prompt.length < LIMITS.promptMin) throw new HttpError(400, 'Describe un poco más tu estrategia');
    const editToken = randomBytes(18).toString('base64url');
    const t = this.now();
    const agent: AgentRecord = {
      id: newId(), name, cls, el, prompt, version: 1, status: 'compiling', editTokenHash: sha(editToken), createdAt: t, updatedAt: t,
      lastPlayedVersion: 0, injectionAttempts: 0, stats: { matches: 0, wins: 0, bestPlace: 0, totalScore: 0, kills: 0 }, history: [],
    };
    await this.d.store.putAgent(agent);
    await this.d.queue.enqueue(agent.id, agent.version);
    return { agent: this.publicAgent(agent), editToken };
  }

  async updateAgent(id: string, token: string | undefined, body: Record<string, unknown>) {
    const agent = await this.d.store.getAgent(id);
    if (!agent) throw new HttpError(404, 'Agente no encontrado');
    if (!token || sha(token) !== agent.editTokenHash) throw new HttpError(403, 'No puedes modificar este agente');
    if (agent.version >= LIMITS.maxVersions) throw new HttpError(429, 'Has alcanzado el máximo de cambios de estrategia');
    const prompt = clean(body.prompt, LIMITS.promptMax);
    if (prompt.length < LIMITS.promptMin) throw new HttpError(400, 'Describe un poco más tu estrategia');
    if (typeof body.cls === 'string' && Object.hasOwn(CLASSES, body.cls)) agent.cls = body.cls as ClassId;
    if (typeof body.el === 'string' && Object.hasOwn(ELEMENTS, body.el)) agent.el = body.el as ElementId;
    agent.prompt = prompt;
    agent.version++;
    agent.status = 'compiling';
    agent.updatedAt = this.now();
    await this.d.store.putAgent(agent);
    await this.d.queue.enqueue(agent.id, agent.version);
    return { agent: this.publicAgent(agent) };
  }

  async getAgent(id: string) {
    const agent = await this.d.store.getAgent(id);
    if (!agent) throw new HttpError(404, 'Agente no encontrado');
    return { agent: this.publicAgent(agent) };
  }

  /** Vista pública: sin el hash del token y con estadísticas derivadas solo de partidas ya reveladas. */
  publicAgent(a: AgentRecord) {
    const { editTokenHash: _omit, ...rest } = a;
    void _omit;
    const history = a.history.filter((h) => h.revealAt <= this.now());
    return { ...rest, history, stats: statsOf(history) };
  }

  /** Worker asíncrono (SQS en AWS): prompt -> política. Nunca deja a un jugador atascado: si Bedrock falla, usa el compilador heurístico. */
  async processCompile(agentId: string, version: number) {
    const agent = await this.d.store.getAgent(agentId);
    if (!agent || agent.version !== version) return; // mensaje obsoleto: ya hay una versión más nueva
    const t0 = this.now();
    let result;
    let usedFallback = false;
    try {
      result = await this.d.compiler.compile({ name: agent.name, cls: agent.cls, el: agent.el, prompt: agent.prompt });
    } catch (err) {
      console.error('compile failed, using heuristic fallback', err);
      usedFallback = true;
      result = { ...heuristicCompile(agent.prompt, agent.cls), nameOk: true };
      result.policy.warnings = [...(result.policy.warnings ?? []), 'La IA no estaba disponible: se usó el intérprete de respaldo.'];
    }
    const fresh = await this.d.store.getAgent(agentId);
    if (!fresh || fresh.version !== version) return;
    fresh.policy = result.policy;
    fresh.compiledVersion = version;
    fresh.compileMs = this.now() - t0;
    fresh.status = 'ready';
    if (!result.nameOk) fresh.name = `Agente-${fresh.id.slice(0, 4)}`;
    if (result.injectionAttempt) fresh.injectionAttempts++;
    await this.d.store.putAgent(fresh);
    await this.mutateState((s) => {
      s.compileCount++;
      if (result.policy.source === 'bedrock') s.bedrockCompiles++;
      if (usedFallback || result.policy.source === 'heuristic') s.fallbackCompiles++;
      if (result.injectionAttempt) s.injectionBlocked++;
    });
  }

  // ---------------------------------------------------------------- partidas

  /** Selecciona jugadores, simula la partida completa (ms), guarda el replay y la programa para empezar en unos segundos. */
  async startMatch(opts: { allowBotOnly?: boolean } = {}): Promise<MatchRecord | null> {
    const all = await this.d.store.listAgents();
    const ready = all.filter((a) => a.status === 'ready' && a.policy);
    // prioridad: estrategias nuevas sin estrenar > menos partidas jugadas > más tiempo esperando
    ready.sort(
      (a, b) =>
        Number(b.version > b.lastPlayedVersion) - Number(a.version > a.lastPlayedVersion) ||
        a.history.length - b.history.length ||
        a.updatedAt - b.updatedAt,
    );
    const humans = ready.slice(0, LIMITS.maxPlayers);
    if (humans.length === 0 && !opts.allowBotOnly) return null;
    const matchNo = (await this.d.store.getState()).matchesPlayed;
    const bots = makeBots(Math.max(0, LIMITS.minPlayers - humans.length), matchNo * 3);
    const entries: AgentEntry[] = [
      ...humans.map((a) => ({ id: a.id, name: a.name, cls: a.cls, el: a.el, policy: a.policy! })),
      ...bots,
    ];
    const id = `${new Date(this.now()).toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${newId().slice(0, 4)}`;
    const seed = randomBytes(4).readUInt32LE(0);
    const replay = simulate(id, seed, entries);
    const narration = await this.d.narrator.narrate(replay);
    await this.d.replays.put(replay);

    const startAt = this.now() + LIMITS.countdownMs;
    const res = new Map(replay.results.map((r) => [r.agentId, r]));
    const match: MatchRecord = {
      id, createdAt: this.now(), startAt, turnMs: LIMITS.turnMs, turns: replay.turns, seed,
      endsAt: startAt + replay.turns * LIMITS.turnMs + LIMITS.resultsMs,
      participants: entries.map((e) => ({ id: e.id, name: e.name, cls: e.cls, el: e.el, isBot: !!e.isBot, version: humans.find((h) => h.id === e.id)?.version ?? 0 })),
      winnerId: replay.winnerId,
      winnerName: replay.agents.find((a) => a.id === replay.winnerId)?.name ?? null,
      narration: narration.text,
      narrationSource: narration.source,
      podium: replay.results.slice(0, 3).map((r) => ({ id: r.agentId, name: replay.agents.find((a) => a.id === r.agentId)!.name, place: r.place, score: r.score })),
      simMs: replay.simMs,
    };
    await this.d.store.putMatch(match);

    for (const h of humans) {
      const r = res.get(h.id)!;
      const fresh = (await this.d.store.getAgent(h.id)) ?? h;
      fresh.lastPlayedVersion = h.version;
      fresh.history = [{ matchId: id, place: r.place, score: r.score, kills: r.kills, version: h.version, players: entries.length, revealAt: startAt + replay.turns * LIMITS.turnMs }, ...fresh.history].slice(0, 100);
      await this.d.store.putAgent(fresh);
    }
    await this.mutateState((s) => {
      s.currentMatchId = id;
      s.matchesPlayed++;
    });
    return match;
  }

  /** Llamado cada minuto (EventBridge) o desde la pantalla del stand: si el modo automático está activo y la partida actual terminó, lanza otra. */
  async tick() {
    const state = await this.d.store.getState();
    if (!state.auto) return { started: false, reason: 'auto-off' };
    const current = state.currentMatchId ? await this.d.store.getMatch(state.currentMatchId) : null;
    if (current && current.endsAt > this.now()) return { started: false, reason: 'match-in-progress' };
    const m = await this.startMatch({ allowBotOnly: true });
    return { started: !!m, matchId: m?.id };
  }

  async setAuto(on: boolean) {
    await this.mutateState((s) => {
      s.auto = on;
    });
    return { auto: on };
  }

  async getMatch(id: string) {
    const m = await this.d.store.getMatch(id);
    if (!m) throw new HttpError(404, 'Partida no encontrada');
    return { match: m, replayUrl: this.d.replays.url(id) };
  }

  // ---------------------------------------------------------------- vista de la arena

  async arena() {
    const [state, agents, recent] = await Promise.all([this.d.store.getState(), this.d.store.listAgents(), this.d.store.listRecentMatches(6)]);
    const current = state.currentMatchId ? (recent.find((m) => m.id === state.currentMatchId) ?? (await this.d.store.getMatch(state.currentMatchId))) : null;
    const ready = agents.filter((a) => a.status === 'ready');
    const leaderboard = agents
      .map((a) => ({ ...a, stats: statsOf(a.history.filter((h) => h.revealAt <= this.now())) }))
      .filter((a) => a.stats.matches > 0)
      .sort((a, b) => b.stats.wins - a.stats.wins || a.stats.bestPlace - b.stats.bestPlace || b.stats.totalScore / b.stats.matches - a.stats.totalScore / a.stats.matches)
      .slice(0, 10)
      .map((a) => ({ id: a.id, name: a.name, cls: a.cls, el: a.el, wins: a.stats.wins, matches: a.stats.matches, bestPlace: a.stats.bestPlace, avgScore: Math.round(a.stats.totalScore / a.stats.matches), versions: a.version }));
    return {
      now: this.now(),
      auto: state.auto,
      current: current ? { ...current, replayUrl: this.d.replays.url(current.id) } : null,
      recent: recent.filter((m) => m.id !== current?.id).slice(0, 5).map((m) => ({ id: m.id, winnerName: m.winnerName, players: m.participants.length, createdAt: m.createdAt })),
      leaderboard,
      lobby: {
        waiting: ready.filter((a) => a.version > a.lastPlayedVersion).length,
        names: ready.filter((a) => a.version > a.lastPlayedVersion).slice(0, 16).map((a) => ({ name: a.name, cls: a.cls, el: a.el })),
      },
      stats: {
        agents: agents.length,
        matches: state.matchesPlayed,
        injectionBlocked: state.injectionBlocked,
        strategies: agents.reduce((s, a) => s + a.version, 0),
        bedrockCompiles: state.bedrockCompiles,
      },
    };
  }

  // ---------------------------------------------------------------- monitorización (solo administración)

  async monitor() {
    const [state, agents, recent] = await Promise.all([this.d.store.getState(), this.d.store.listAgents(), this.d.store.listRecentMatches(10)]);
    const now = this.now();
    const current = state.currentMatchId ? (recent.find((m) => m.id === state.currentMatchId) ?? (await this.d.store.getMatch(state.currentMatchId))) : null;
    const phaseOf = (m: MatchRecord) =>
      now < m.startAt ? 'countdown' : now < m.startAt + m.turns * m.turnMs ? 'playing' : now < m.endsAt ? 'results' : 'finished';
    const times = agents.map((a) => a.compileMs).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
    const pct = (p: number) => (times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))] : 0);
    const split = (m: MatchRecord) => ({ humans: m.participants.filter((p) => !p.isBot).length, bots: m.participants.filter((p) => p.isBot).length });
    return {
      now,
      auto: state.auto,
      config: this.d.info ?? {},
      counters: {
        agents: agents.length,
        ready: agents.filter((a) => a.status === 'ready').length,
        compiling: agents.filter((a) => a.status === 'compiling').length,
        errors: agents.filter((a) => a.status === 'error').length,
        waiting: agents.filter((a) => a.status === 'ready' && a.version > a.lastPlayedVersion).length,
        strategies: agents.reduce((s, a) => s + a.version, 0),
        matches: state.matchesPlayed,
        injectionBlocked: state.injectionBlocked,
        compileCount: state.compileCount,
        bedrockCompiles: state.bedrockCompiles,
        fallbackCompiles: state.fallbackCompiles,
      },
      compile: { samples: times.length, p50Ms: pct(0.5), p95Ms: pct(0.95), maxMs: times[times.length - 1] ?? 0 },
      current: current
        ? {
            id: current.id, phase: phaseOf(current), startAt: current.startAt, endsAt: current.endsAt, turns: current.turns, turnMs: current.turnMs,
            ...split(current), simMs: current.simMs, participants: current.participants.map((p) => p.name),
            winnerName: phaseOf(current) === 'results' || phaseOf(current) === 'finished' ? current.winnerName : null,
          }
        : null,
      recent: recent.map((m) => ({ id: m.id, createdAt: m.createdAt, winnerName: m.winnerName, ...split(m), turns: m.turns, simMs: m.simMs, narrationSource: m.narrationSource })),
      agents: agents
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((a) => ({
          id: a.id, name: a.name, cls: a.cls, el: a.el, status: a.status, version: a.version, prompt: a.prompt,
          compiledBy: a.policy?.source ?? null, compileMs: a.compileMs ?? null, injectionAttempts: a.injectionAttempts,
          updatedAt: a.updatedAt, queued: a.status === 'ready' && a.version > a.lastPlayedVersion,
          stats: statsOf(a.history.filter((h) => h.revealAt <= now)),
        })),
    };
  }

  private async mutateState(fn: (s: ArenaState) => void) {
    for (let i = 0; i < 5; i++) {
      const s = await this.d.store.getState();
      const expected = s.version;
      fn(s);
      s.version = expected + 1;
      if (await this.d.store.putState(s, expected)) return;
    }
    throw new Error('No se pudo actualizar el estado (concurrencia)');
  }
}
