import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { heuristicCompile } from '../engine/heuristic';
import type { ClassId, Replay } from '../engine/types';
import { templateNarration } from '../core/narrate';
import type { AgentRecord, ArenaState, CompileQueue, CompileResult, MatchRecord, Narrator, PolicyCompiler, ReplayStore, Store } from '../core/ports';

// Adaptadores para desarrollo local: estado en ficheros JSON bajo .data/, sin dependencias de AWS.

export const initialState = (): ArenaState => ({
  version: 0, currentMatchId: null, auto: false, matchesPlayed: 0, injectionBlocked: 0, compileCount: 0, bedrockCompiles: 0, fallbackCompiles: 0,
});

export class FileStore implements Store {
  private agents = new Map<string, AgentRecord>();
  private matches = new Map<string, MatchRecord>();
  private state: ArenaState = initialState();
  private file: string;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'db.json');
    if (existsSync(this.file)) {
      const d = JSON.parse(readFileSync(this.file, 'utf8'));
      this.agents = new Map(d.agents.map((a: AgentRecord) => [a.id, a]));
      this.matches = new Map(d.matches.map((m: MatchRecord) => [m.id, m]));
      this.state = d.state;
    }
  }
  private save() {
    writeFileSync(this.file, JSON.stringify({ agents: [...this.agents.values()], matches: [...this.matches.values()], state: this.state }));
  }
  private clone = <T>(v: T): T => structuredClone(v);
  async getAgent(id: string) { return this.agents.has(id) ? this.clone(this.agents.get(id)!) : null; }
  async putAgent(a: AgentRecord) { this.agents.set(a.id, this.clone(a)); this.save(); }
  async listAgents() { return [...this.agents.values()].map(this.clone); }
  async getMatch(id: string) { return this.matches.has(id) ? this.clone(this.matches.get(id)!) : null; }
  async putMatch(m: MatchRecord) { this.matches.set(m.id, this.clone(m)); this.save(); }
  async listRecentMatches(limit: number) { return [...this.matches.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(this.clone); }
  async getState() { return this.clone(this.state); }
  async putState(s: ArenaState, expectedVersion: number) {
    if (this.state.version !== expectedVersion) return false;
    this.state = this.clone(s);
    this.save();
    return true;
  }
}

export class FileReplayStore implements ReplayStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  async put(r: Replay) { writeFileSync(join(this.dir, `${r.matchId}.json`), JSON.stringify(r)); }
  url(matchId: string) { return `/replays/${matchId}.json`; }
}

/** En local "encolar" = procesar en segundo plano en el mismo proceso (simulando la latencia del LLM). */
export class InProcessQueue implements CompileQueue {
  handler: ((id: string, v: number) => Promise<void>) | null = null;
  async enqueue(agentId: string, version: number) {
    setTimeout(() => this.handler?.(agentId, version).catch((e) => console.error(e)), 50);
  }
}

export class HeuristicCompiler implements PolicyCompiler, Narrator {
  constructor(private delayMs = 900) {}
  async compile(input: { cls: ClassId; prompt: string }): Promise<CompileResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return { ...heuristicCompile(input.prompt, input.cls), nameOk: true };
  }
  async narrate(r: Replay) { return { text: templateNarration(r), source: 'template' as const }; }
}
