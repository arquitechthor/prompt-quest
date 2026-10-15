import type { ClassId, ElementId, Policy, Replay } from '../engine/types';

// ---------------------------------------------------------------------------
// Modelo de dominio persistido
// ---------------------------------------------------------------------------

export type AgentStatus = 'compiling' | 'ready' | 'error';

export interface AgentRecord {
  id: string;
  name: string;
  cls: ClassId;
  el: ElementId;
  prompt: string;
  version: number; // se incrementa con cada cambio de estrategia
  status: AgentStatus;
  policy?: Policy;
  compiledVersion?: number;
  compileMs?: number;
  editTokenHash: string;
  createdAt: number;
  updatedAt: number;
  lastPlayedVersion: number;
  injectionAttempts: number;
  stats: { matches: number; wins: number; bestPlace: number; totalScore: number; kills: number };
  /** Resultados por partida. Solo cuentan cuando now >= revealAt (fin de la reproducción): sin spoilers. */
  history: { matchId: string; place: number; score: number; kills: number; version: number; players: number; revealAt: number }[];
}

export interface MatchParticipant {
  id: string;
  name: string;
  cls: ClassId;
  el: ElementId;
  isBot: boolean;
  version: number;
}

export interface MatchRecord {
  id: string;
  createdAt: number;
  startAt: number; // momento sincronizado en el que todos los clientes empiezan a reproducir
  endsAt: number;
  turnMs: number;
  turns: number;
  seed: number;
  participants: MatchParticipant[];
  winnerId: string | null;
  winnerName: string | null;
  narration: string;
  narrationSource: 'bedrock' | 'template';
  podium: { id: string; name: string; place: number; score: number }[];
  simMs: number;
}

export interface ArenaState {
  version: number;
  currentMatchId: string | null;
  auto: boolean;
  matchesPlayed: number;
  injectionBlocked: number;
  compileCount: number;
  bedrockCompiles: number;
  fallbackCompiles: number;
}

// ---------------------------------------------------------------------------
// Puertos (implementados por adaptadores locales o de AWS)
// ---------------------------------------------------------------------------

export interface Store {
  getAgent(id: string): Promise<AgentRecord | null>;
  putAgent(a: AgentRecord): Promise<void>;
  listAgents(): Promise<AgentRecord[]>;
  getMatch(id: string): Promise<MatchRecord | null>;
  putMatch(m: MatchRecord): Promise<void>;
  listRecentMatches(limit: number): Promise<MatchRecord[]>;
  getState(): Promise<ArenaState>;
  /** Escritura condicional (concurrencia optimista): falla si la versión ha cambiado. */
  putState(s: ArenaState, expectedVersion: number): Promise<boolean>;
}

export interface ReplayStore {
  put(replay: Replay): Promise<void>;
  url(matchId: string): string;
}

export interface CompileQueue {
  enqueue(agentId: string, version: number): Promise<void>;
}

export interface CompileResult {
  policy: Policy;
  injectionAttempt: boolean;
  nameOk: boolean;
}

export interface PolicyCompiler {
  compile(input: { name: string; cls: ClassId; el: ElementId; prompt: string }): Promise<CompileResult>;
}

export interface Narrator {
  narrate(replay: Replay): Promise<{ text: string; source: 'bedrock' | 'template' }>;
}
