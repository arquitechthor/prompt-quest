# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Prompt Quest: Agent Arena — event game where each attendee writes a natural-language strategy, an LLM (Claude on Amazon Bedrock) compiles it into a structured policy, and a deterministic engine runs up to 16 agents per match, shown live on a stand screen and on phones. Code, UI text and docs are in Spanish; keep new user-facing text in Spanish. Original idea: `idea/prompt_quest_agent_arena.md`. Event proposal page: `docs/propuesta.html` (published as a claude.ai artifact).

## Commands

The dev machine has Node 24 + npm only (no admin rights, no AWS CLI, Python or Docker). Everything runs through npm/npx.

- `npm run dev` — builds the web bundle and starts the local server on http://localhost:5173 (public stand screen `/#/arena`, admin console `/#/admin` with key `local-admin`, about page `/como-se-hizo.html`). Uses the heuristic compiler; `COMPILER=bedrock npm run dev` uses Bedrock with local AWS credentials. Local state lives in `.data/` (delete it to reset). The server does not hot-reload: restart after backend/engine changes; frontend changes only need `npm run build:web`.
- `npm test` — runs `scripts/smoke.ts` (plain `node:assert`, no test framework; there is no way to run a single test other than editing the file).
- `npm run typecheck` — `tsc --noEmit` over `src`, `infra`, `scripts`. There is no linter.
- `npm run sim -- 2000` — Monte Carlo balance run: ms/match, normalized win rate per class/element, and win rate per strategy prompt. Rerun after touching `src/engine/rules.ts` or engine logic.
- `npx tsx scripts/try-bedrock.ts` — compiles example prompts against real Bedrock (needs AWS credentials; `MODEL_ID`, `BEDROCK_REGION` optional).
- `CDK_DEFAULT_REGION=eu-west-1 npx cdk synth` — synthesizes the stack and bundles Lambdas with local esbuild (no Docker, no credentials needed). `npm run deploy -- -c alertEmail=...` deploys; context params are documented in README.md (`modelId`, `bedrockRegion`, `compiler`, `narration`, `budgetUsd`). Deployment without local tooling is done from AWS CloudShell (README).

## Architecture

Three layers, hexagonal (ports and adapters), so the same domain runs locally and on AWS:

- `src/engine/` — pure, browser-safe code shared by backend and frontend. `simulate(matchId, seed, entries)` is a pure function that returns a full `Replay` (all frames, events, per-turn decisions, results). It is deterministic via the seeded `Rng` (mulberry32): never use `Math.random()` or iteration-order/index tie-breaks inside the engine (an index tie-break once biased win rates; ties use the per-agent random `tb`). All balance numbers live in `rules.ts`.
- The policy DSL (`types.ts`: `FACTS`, `ACTIONS`, `TARGETS`; `policy.ts`: `POLICY_SCHEMA`, `sanitizePolicy`) is the contract between the LLM and the engine. Prompts are untrusted data: the LLM output is constrained by the JSON Schema and then re-validated/clamped by `sanitizePolicy`. Adding a fact or action means updating the type list, the engine (`factValue`/`feasible`/`execute` in `simulate.ts`), the Spanish labels in `policy.ts`, and the system prompt in `src/core/bedrock.ts`.
- Each turn an agent evaluates its rules in order; the first whose conditions hold and whose action is feasible wins; otherwise `defaultAction`. A built-in instinct (return to the safe zone) runs before the rules. Decisions are recorded per frame as `[agentIdx, ruleIdx, action]` (`-1` instinct, `-2` default) — the frontend feed, live "regla activa" and post-match lessons are derived from these, never invented.
- `src/engine/heuristic.ts` is the keyword-based fallback compiler (used locally, for bots in `presets.ts`, and when Bedrock fails). It is intentionally crude.
- `src/core/` — domain service (`service.ts`: agents, async compile, matchmaking, match start, tick, arena view), ports (`ports.ts`), transport-agnostic HTTP router (`http.ts`, used by both Lambda and the local server), Bedrock compiler/narrator (`bedrock.ts`, `@anthropic-ai/bedrock-sdk` legacy InvokeModel client → IAM `bedrock:InvokeModel`; default model `anthropic.claude-haiku-5-5`).
- `src/adapters/` — `local.ts` (JSON file store in `.data/`, in-process queue, heuristic compiler) and `aws.ts` (DynamoDB single-table `pk`/`sk` with GSI `byType`, S3 gzipped replays, SQS).
- `src/lambda/handlers.ts` — three entry points over one service: `api` (API Gateway HTTP), `compile` (SQS, max concurrency 5), `tick` (EventBridge every minute; loops within the minute while auto mode is on).
- `src/web/` — vanilla TS + canvas, bundled by `scripts/build-web.mjs` into `dist/web`. 8-bit look: sprites are 16×16 character matrices in `sprites.ts` (palette-swapped per element, validated at load; also used as `<img>` avatars). `render.ts` draws a low-res world (16 px/tile) scaled without smoothing; every effect (projectiles, particles, shake, big-screen announcements) is a pure function of the fractional frame `f` and the replay events, with no per-frame state, so all screens show the same thing. `sfx.ts` synthesizes chiptune sounds with WebAudio from the renderer's `cues`; only the stand screen plays them (unlocked by the first click/key, no visible control). Hash routes: `#/` player (phone), `#/arena` public stand screen (never shows controls), `#/admin` admin console (login; key kept only in `sessionStorage`; polls `GET /api/admin/monitor`). `src/web/como-se-hizo.html` is a standalone static page (general + technical tabs, AWS services detail) copied by the build; keep its service list in sync with `infra/app.ts`.
- Admin auth: `x-admin-key` header compared in constant time. In AWS the key lives in Secrets Manager (`ADMIN_SECRET_ARN`, read once per container in `handlers.ts`); locally it is `ADMIN_KEY` or `local-admin`.

Key flows and invariants:

- "Simulate once, replay everywhere": a match is fully simulated when started, the replay is stored as an immutable file (`/replays/<id>.json`), and clients play it synced to `startAt` using the server clock offset from `GET /api/arena`. No WebSockets.
- Results are hidden until playback ends: agent history entries carry `revealAt`, and stats/leaderboard are derived from revealed history only (`statsOf` in `service.ts`). Don't write match results directly into stats.
- Arena state uses optimistic concurrency (`putState(s, expectedVersion)`); mutate it through `mutateState`.
- `GET /api/arena` returns `Cache-Control: max-age=2` and CloudFront honors it (micro-caching); per-agent endpoints are `no-store`.
- Validate enum-like request fields with `Object.hasOwn`, not `in` (prototype keys like `constructor`).
- `package.json` has `"type": "module"`, but the CDK Lambda bundle is CJS; loading `cdk.out` bundles locally with Node will show empty exports. That's expected; the bundle is fine in Lambda.

`infra/app.ts` is the single CDK stack: CloudFront (S3 web + S3 replays + `/api/*` → HTTP API), Lambdas (Node 22, ARM64), DynamoDB on-demand, SQS + DLQ, EventBridge rule, optional AWS Budget. All resources use `RemovalPolicy.DESTROY` (prototype).
