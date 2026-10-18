import qrcode from 'qrcode-generator';
import { ruleText } from '../engine/policy';
import { CLASSES, ELEMENTS } from '../engine/rules';
import { EXAMPLE_PROMPTS } from '../engine/presets';
import type { ClassId, ElementId, Policy, Replay } from '../engine/types';
import { ArenaRenderer, CLASS_GLYPH, EL_GLYPH } from './render';
import { feedLines, lessons } from './report';

// ----------------------------------------------------------------------------- utilidades

interface Participant { id: string; name: string; cls: ClassId; el: ElementId; isBot: boolean }
interface MatchView {
  id: string; startAt: number; endsAt: number; turnMs: number; turns: number; replayUrl: string;
  participants: Participant[]; winnerName: string | null; narration: string; narrationSource: string;
  podium: { id: string; name: string; place: number; score: number }[];
}
interface ArenaView {
  now: number; auto: boolean; current: MatchView | null;
  leaderboard: { id: string; name: string; cls: ClassId; el: ElementId; wins: number; matches: number; bestPlace: number; avgScore: number; versions: number }[];
  lobby: { waiting: number; names: { name: string; cls: ClassId; el: ElementId }[] };
  stats: { agents: number; matches: number; injectionBlocked: number; strategies: number; bedrockCompiles: number };
  recent: { id: string; winnerName: string; players: number }[];
}
interface AgentView {
  id: string; name: string; cls: ClassId; el: ElementId; prompt: string; version: number; status: 'compiling' | 'ready' | 'error';
  policy?: Policy; compileMs?: number; lastPlayedVersion: number; injectionAttempts: number;
  stats: { matches: number; wins: number; bestPlace: number; totalScore: number; kills: number };
  history: { matchId: string; place: number; score: number; version: number; players: number }[];
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const app = $<HTMLDivElement>('#app');
let serverOffset = 0;
const now = () => Date.now() + serverOffset;
const store = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}
async function getArena(): Promise<ArenaView> {
  const a = await api<ArenaView>('/api/arena');
  serverOffset = a.now - Date.now();
  return a;
}
const replayCache = new Map<string, Promise<Replay>>();
function loadReplay(url: string): Promise<Replay> {
  if (!replayCache.has(url)) replayCache.set(url, fetch(url).then((r) => r.json()));
  return replayCache.get(url)!;
}
const avatar = (cls: ClassId, el: ElementId, size = 44) =>
  `<span class="avatar" style="--el:${ELEMENTS[el].color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.52)}px">${CLASS_GLYPH[cls]}</span>`;
const avatarName = (cls: ClassId, el: ElementId) => `${CLASSES[cls].name} de ${ELEMENTS[el].name}`;

// ----------------------------------------------------------------------------- jugador (móvil)

interface Session { id: string; token: string }

class PlayerScreen {
  private session = store.get<Session>('pq.session');
  private agent: AgentView | null = null;
  private arena: ArenaView | null = null;
  private viewKey = '';
  private editing = false;
  private timer = 0;
  private raf = 0;
  private draft = store.get<{ name: string; cls: ClassId; el: ElementId; prompt: string }>('pq.draft') ?? { name: '', cls: 'archer' as ClassId, el: 'fire' as ElementId, prompt: '' };

  start() {
    this.poll();
    this.timer = window.setInterval(() => this.poll(), 2000);
  }
  stop() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
  }

  private async poll() {
    try {
      const [arena, agent] = await Promise.all([getArena(), this.session ? api<{ agent: AgentView }>(`/api/agents/${this.session.id}`).then((r) => r.agent).catch(() => null) : Promise.resolve(null)]);
      this.arena = arena;
      if (this.session && !agent) { this.session = null; store.del('pq.session'); }
      this.agent = agent;
      this.render();
    } catch (e) {
      console.warn(e);
    }
  }

  private decide(): string {
    const a = this.agent;
    if (!a) return 'create';
    if (this.editing) return 'edit';
    if (a.status === 'compiling') return 'compiling';
    const cur = this.arena?.current;
    if (cur && cur.participants.some((p) => p.id === a.id) && now() < cur.startAt + cur.turns * cur.turnMs + 1200) return `live:${cur.id}`;
    const last = a.history[0];
    if (last && store.get<string>('pq.seen') !== last.matchId) return `report:${last.matchId}`;
    return `ready:${a.version}`;
  }

  private render(force = false) {
    const key = this.decide();
    if (!force && key === this.viewKey) {
      this.refreshDynamic();
      return;
    }
    cancelAnimationFrame(this.raf);
    this.viewKey = key;
    const [kind, arg] = key.split(':');
    if (kind === 'create') this.renderForm(false);
    else if (kind === 'edit') this.renderForm(true);
    else if (kind === 'compiling') this.renderCompiling();
    else if (kind === 'live') this.renderLive();
    else if (kind === 'report') this.renderReport(arg);
    else this.renderReady();
    window.scrollTo({ top: 0 });
  }

  private refreshDynamic() {
    const q = document.getElementById('queue-status');
    if (q && this.agent) q.innerHTML = this.queueStatus();
  }

  private queueStatus(): string {
    const a = this.agent!;
    const cur = this.arena?.current;
    const remaining = cur ? Math.max(0, Math.round((cur.endsAt - now()) / 1000)) : 0;
    const fresh = a.version > a.lastPlayedVersion;
    const auto = this.arena?.auto;
    const when = cur && remaining > 0 ? `La partida en curso termina en ~${remaining} s.` : auto ? 'La próxima partida empieza enseguida.' : 'Esperando a que el stand lance la siguiente partida.';
    return fresh
      ? `<b>⏳ Tu agente está en la cola.</b> ${when} Mira la pantalla grande.`
      : `<b>✅ Tu agente sigue compitiendo.</b> ${when} Cambia tu estrategia para intentar mejorar.`;
  }

  // ---- formulario de creación / edición
  private renderForm(editing: boolean) {
    const a = this.agent;
    const d = editing && a ? { name: a.name, cls: a.cls, el: a.el, prompt: a.prompt } : this.draft;
    // en edición el nombre no se puede cambiar, pero debe quedar claro qué agente se está mejorando
    const who = (cls: ClassId, el: ElementId) =>
      `${avatar(cls, el, 52)}<div><h2>${esc(a!.name)}</h2><small>${esc(avatarName(cls, el))} · estrategia v${a!.version} → v${a!.version + 1}</small></div>`;
    app.innerHTML = `
      <main class="phone">
        <header class="brand"><span class="logo">PROMPT QUEST</span><span class="tag">Agent Arena</span></header>
        ${editing && a ? `<div class="ph report-agent" id="who">${who(d.cls, d.el)}</div>` : ''}
        ${editing ? `<h1>Mejora tu estrategia</h1><p class="lead">Cambia una sola cosa y comprueba si tu agente mejora. Así se evalúan los agentes de IA de verdad.</p>`
          : `<h1>Crea tu agente</h1><p class="lead">Tú escribes la estrategia. Una IA en AWS la convierte en el cerebro de tu agente. Luego compite solo.</p>`}
        <form id="f" autocomplete="off">
          ${editing ? '' : `<label class="fld"><span>Nombre</span><input name="name" maxlength="20" required value="${esc(d.name)}" placeholder="Ej.: Sombra Letal"></label>`}
          <div class="fld"><span>Personaje</span><div class="cards" id="cls">
            ${(Object.keys(CLASSES) as ClassId[]).map((c) => `
              <button type="button" class="card ${d.cls === c ? 'on' : ''}" data-v="${c}">
                <span class="g">${CLASS_GLYPH[c]}</span><b>${CLASSES[c].name}</b><small>${esc(CLASSES[c].passive.split(':')[0])}</small>
                <i class="stats">❤ ${CLASSES[c].hp} · ⚔ ${CLASSES[c].atk} · 🎯 ${CLASSES[c].range}</i>
              </button>`).join('')}
          </div></div>
          <div class="fld"><span>Elemento</span><div class="chips" id="el">
            ${(Object.keys(ELEMENTS) as ElementId[]).map((e) => `<button type="button" class="chip ${d.el === e ? 'on' : ''}" data-v="${e}" style="--el:${ELEMENTS[e].color}">${EL_GLYPH[e]} ${ELEMENTS[e].name}</button>`).join('')}
          </div><small class="hint" id="el-hint">${esc(ELEMENTS[d.el].effect)} · Fuego › Aire › Tierra › Agua › Fuego</small></div>
          <div class="preview" id="pv">${avatar(d.cls, d.el, 56)}<div><b id="pv-name">${esc(avatarName(d.cls, d.el))}</b><small id="pv-sp">Especial: ${esc(CLASSES[d.cls].specialName)}</small></div></div>
          <label class="fld"><span>Estrategia <small id="cnt">${d.prompt.length}/500</small></span>
            <textarea name="prompt" maxlength="500" rows="5" required placeholder="Describe cómo debe comportarse tu agente, como si dieras instrucciones a un jugador…">${esc(d.prompt)}</textarea></label>
          <div class="examples">${EXAMPLE_PROMPTS.map((x, i) => `<button type="button" class="ex" data-i="${i}">💡 ${x.title}</button>`).join('')}</div>
          <p class="err" id="err"></p>
          <button class="cta" type="submit">${editing ? '🔁 Compilar y volver a la arena' : '⚔️ ¡A la arena!'}</button>
          ${editing ? '<button class="ghost" type="button" id="cancel">Cancelar</button>' : ''}
        </form>
        <footer class="foot">Tu prompt se trata como dato no confiable: la IA solo puede expresar estrategias con las reglas del juego. Intenta hacer trampa… si te atreves 😉</footer>
      </main>`;
    const form = $<HTMLFormElement>('#f');
    const state = { ...d };
    const sync = () => {
      $('#pv').innerHTML = `${avatar(state.cls, state.el, 56)}<div><b>${esc(avatarName(state.cls, state.el))}</b><small>Especial: ${esc(CLASSES[state.cls].specialName)} · Debilidad: ${esc(CLASSES[state.cls].weakness)}</small></div>`;
      $('#el-hint').textContent = `${ELEMENTS[state.el].effect} · Fuego › Aire › Tierra › Agua › Fuego`;
      if (editing && a) $('#who').innerHTML = who(state.cls, state.el);
      if (!editing) { this.draft = { ...state, name: (form.elements.namedItem('name') as HTMLInputElement).value, prompt: (form.elements.namedItem('prompt') as HTMLTextAreaElement).value }; store.set('pq.draft', this.draft); }
    };
    const pick = (id: string, key: 'cls' | 'el') =>
      $(`#${id}`).addEventListener('click', (ev) => {
        const b = (ev.target as HTMLElement).closest('button');
        if (!b) return;
        $(`#${id}`).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        (state as Record<string, string>)[key] = b.dataset.v!;
        sync();
      });
    pick('cls', 'cls');
    pick('el', 'el');
    const ta = form.elements.namedItem('prompt') as HTMLTextAreaElement;
    ta.addEventListener('input', () => { $('#cnt').textContent = `${ta.value.length}/500`; sync(); });
    form.querySelector('.examples')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (!b) return;
      ta.value = EXAMPLE_PROMPTS[Number(b.dataset.i)].text;
      ta.dispatchEvent(new Event('input'));
    });
    document.getElementById('cancel')?.addEventListener('click', () => { this.editing = false; this.render(true); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector<HTMLButtonElement>('.cta')!;
      btn.disabled = true;
      $('#err').textContent = '';
      try {
        if (editing && this.session) {
          const r = await api<{ agent: AgentView }>(`/api/agents/${this.session.id}`, { method: 'PUT', headers: { 'x-edit-token': this.session.token }, body: JSON.stringify({ prompt: ta.value, cls: state.cls, el: state.el }) });
          this.agent = r.agent;
          this.editing = false;
        } else {
          const name = (form.elements.namedItem('name') as HTMLInputElement).value;
          const r = await api<{ agent: AgentView; editToken: string }>('/api/agents', { method: 'POST', body: JSON.stringify({ name, cls: state.cls, el: state.el, prompt: ta.value }) });
          this.session = { id: r.agent.id, token: r.editToken };
          store.set('pq.session', this.session);
          this.agent = r.agent;
        }
        this.render(true);
      } catch (e) {
        $('#err').textContent = (e as Error).message;
        btn.disabled = false;
      }
    });
  }

  private renderCompiling() {
    const a = this.agent!;
    app.innerHTML = `
      <main class="phone center">
        <div class="compiling">${avatar(a.cls, a.el, 96)}<div class="ring"></div></div>
        <h1>Compilando la estrategia de ${esc(a.name)}…</h1>
        <p class="lead">Un modelo de IA en Amazon Bedrock está convirtiendo tu texto en reglas que el motor puede ejecutar.</p>
        <ol class="pipeline"><li class="done">Prompt recibido</li><li class="doing">IA: lenguaje natural → política estructurada</li><li>Validación contra las reglas del juego</li><li>Agente listo</li></ol>
        <blockquote>${esc(a.prompt)}</blockquote>
      </main>`;
  }

  private policyHtml(a: AgentView) {
    const p = a.policy!;
    const src = p.source === 'bedrock' ? '🧠 Compilado por IA (Amazon Bedrock)' : p.source === 'heuristic' ? '⚙️ Compilado por el intérprete de respaldo' : '📦 Preset';
    return `
      <section class="policy">
        <div class="ph">${avatar(a.cls, a.el, 52)}<div><h2>${esc(a.name)}</h2><small>${esc(avatarName(a.cls, a.el))} · v${a.version}</small></div></div>
        <p class="summary">“${esc(p.summary)}”</p>
        <div class="traits">
          ${(['aggression', 'caution', 'greed'] as const).map((k) => `<div><span>${{ aggression: 'Agresividad', caution: 'Prudencia', greed: 'Codicia' }[k]}</span><i style="--v:${p.traits[k]}%"></i></div>`).join('')}
        </div>
        <h3>Así lo ejecutará la máquina <small>(se evalúan en orden)</small></h3>
        <ol class="rules">${p.rules.map((r) => `<li><b>${esc(r.label)}</b><code>${esc(ruleText(r))}</code></li>`).join('')}
          <li class="def"><b>Si nada aplica</b><code>→ ${esc(p.defaultAction)}</code></li></ol>
        ${a.injectionAttempts > 0 ? `<div class="shield">🛡️ <b>Intento de manipulación detectado.</b> La IA ignoró las instrucciones que intentaban saltarse las reglas y solo compiló tu estrategia. ¡Buen intento!</div>` : ''}
        ${p.warnings?.length ? `<ul class="warn">${p.warnings.map((w) => `<li>⚠️ ${esc(w)}</li>`).join('')}</ul>` : ''}
        <small class="src">${src}${a.compileMs ? ` en ${(a.compileMs / 1000).toFixed(1)} s` : ''}</small>
      </section>`;
  }

  private historyHtml(a: AgentView) {
    if (!a.history.length) return '';
    return `<section class="hist"><h3>Tu evolución</h3><ul>${a.history.slice(0, 6).map((h) => `<li><span>v${h.version}</span><b>${h.place}º</b><small>de ${h.players} · ${h.score} pts</small></li>`).join('')}</ul></section>`;
  }

  private renderReady() {
    const a = this.agent!;
    app.innerHTML = `
      <main class="phone">
        <header class="brand"><span class="logo">PROMPT QUEST</span><span class="tag">Agent Arena</span></header>
        <div class="status" id="queue-status">${this.queueStatus()}</div>
        ${this.policyHtml(a)}
        ${this.historyHtml(a)}
        <button class="cta" id="edit">✏️ Modificar estrategia</button>
        <button class="ghost" id="new">Crear otro agente</button>
      </main>`;
    $('#edit').onclick = () => { this.editing = true; this.render(true); };
    $('#new').onclick = () => { if (confirmNew()) { store.del('pq.session'); this.session = null; this.agent = null; this.render(true); } };
  }

  private async renderLive() {
    const a = this.agent!;
    const cur = this.arena!.current!;
    app.innerHTML = `
      <main class="phone live">
        <div class="live-head"><span class="pill red">● EN DIRECTO</span><b>${esc(a.name)}</b><span id="turn"></span></div>
        <div class="canvas-wrap"><canvas id="cv"></canvas><div class="overlay" id="ov"></div></div>
        <div class="me-status"><div class="hpbar"><i id="hp"></i></div><div id="now" class="now">Cargando…</div></div>
        <p class="hint">Tu agente lleva el aro amarillo. Lo que ves es su política ejecutándose: nadie lo controla.</p>
      </main>`;
    const replay = await loadReplay(cur.replayUrl);
    if (!this.viewKey.startsWith('live')) return;
    const cv = $<HTMLCanvasElement>('#cv');
    const r = new ArenaRenderer(cv, replay, { highlightId: a.id });
    const idx = replay.agents.findIndex((x) => x.id === a.id);
    const loop = () => {
      const f = (now() - cur.startAt) / cur.turnMs;
      r.draw(Math.max(0, f));
      const ov = $('#ov');
      if (f < 0) { ov.innerHTML = `<div class="count">${Math.ceil(-f * cur.turnMs / 1000)}</div><small>¡Tu agente entra en la arena!</small>`; ov.hidden = false; }
      else ov.hidden = true;
      const fi = Math.max(0, Math.min(replay.frames.length - 1, Math.floor(f) + 1));
      const snap = replay.frames[fi].agents[idx];
      $('#turn').textContent = `Turno ${Math.min(replay.turns, Math.max(0, Math.floor(f) + 1))}/${replay.turns}`;
      $<HTMLElement>('#hp').style.width = `${(snap[2] / replay.agents[idx].maxHp) * 100}%`;
      const d = replay.frames[fi].decisions.find((x) => x[0] === idx);
      const label = d ? (d[1] === -1 ? 'Instinto: volver a la zona segura' : d[1] === -2 ? `Por defecto: ${d[2]}` : replay.agents[idx].rules[d[1]]) : null;
      $('#now').innerHTML = !snap[4] ? '💀 Eliminado. Espera al informe…' : label ? `🧠 <b>Regla activa:</b> «${esc(label)}»` : 'Preparado…';
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private async renderReport(matchId: string) {
    const a = this.agent!;
    app.innerHTML = `<main class="phone center"><p class="lead">Preparando tu informe…</p></main>`;
    try {
      const { replayUrl } = await api<{ replayUrl: string }>(`/api/matches/${matchId}`);
      const replay = await loadReplay(replayUrl);
      if (this.viewKey !== `report:${matchId}`) return;
      const L = lessons(replay, a.id);
      const res = L.res;
      const ag = replay.agents[L.idx];
      const maxFire = Math.max(1, ...res.ruleFires);
      app.innerHTML = `
        <main class="phone">
          <header class="brand"><span class="logo">PROMPT QUEST</span><span class="tag">Informe de partida</span></header>
          <div class="ph report-agent">${avatar(ag.cls, ag.el, 52)}<div><h2>${esc(ag.name)}</h2><small>${esc(avatarName(ag.cls, ag.el))} · estrategia v${a.history.find((h) => h.matchId === matchId)?.version ?? a.version}</small></div></div>
          <section class="place ${res.place === 1 ? 'gold' : ''}"><span class="big">${res.place}º</span><small><b>${esc(ag.name)}</b> · de ${replay.agents.length} agentes · ${res.score} puntos</small></section>
          <div class="kpis">
            <div><b>${res.kills}</b><small>eliminaciones</small></div><div><b>${res.damageDealt}</b><small>daño infligido</small></div>
            <div><b>${res.items}</b><small>objetos</small></div><div><b>${res.survivedTurns}</b><small>turnos vivo</small></div>
          </div>
          ${L.killer ? `<p class="lead">Eliminado por <b>${esc(L.killer)}</b> en el turno ${res.survivedTurns}.</p>` : res.deathCause === 'zone' ? '<p class="lead">Cayó fuera de la zona segura.</p>' : ''}
          <section class="lessons"><h3>Lecciones</h3>${L.lessons.map((l) => `<p><span>${l.icon}</span>${esc(l.text)}</p>`).join('')}</section>
          <section class="usage"><h3>Estrategia declarada vs. comportamiento observado</h3>
            ${ag.rules.map((label, i) => `<div class="u"><span>${esc(label)}</span><i style="--v:${(res.ruleFires[i] / maxFire) * 100}%"></i><b>${res.ruleFires[i]}</b></div>`).join('')}
            <div class="u def"><span>Acción por defecto</span><i style="--v:${(res.defaultFires / Math.max(maxFire, res.defaultFires)) * 100}%"></i><b>${res.defaultFires}</b></div>
            <small>Veces que se activó cada regla en ${L.decisions} decisiones.</small>
          </section>
          ${this.historyHtml(a)}
          <button class="cta" id="improve">🔁 Mejorar mi estrategia</button>
          <button class="ghost" id="ok">Seguir con esta estrategia</button>
        </main>`;
      $('#improve').onclick = () => { store.set('pq.seen', matchId); this.editing = true; this.render(true); };
      $('#ok').onclick = () => { store.set('pq.seen', matchId); this.render(true); };
    } catch (e) {
      app.innerHTML = `<main class="phone center"><p class="err">${esc((e as Error).message)}</p></main>`;
      store.set('pq.seen', matchId);
    }
  }
}

function confirmNew() {
  // sin diálogos modales del navegador: doble pulsación para confirmar
  const b = document.getElementById('new')!;
  if (b.dataset.confirm) return true;
  b.dataset.confirm = '1';
  b.textContent = 'Pulsa otra vez para confirmar (perderás el acceso a este agente)';
  return false;
}

// ----------------------------------------------------------------------------- pantalla del stand

class ArenaScreen {
  private arena: ArenaView | null = null;
  private matchId = '';
  private replay: Replay | null = null;
  private renderer: ArenaRenderer | null = null;
  private lastFrame = -1;
  private timer = 0;
  private raf = 0;

  start() {
    const joinUrl = `${location.origin}/`;
    const aboutUrl = `${location.origin}/como-se-hizo.html`;
    const qrSvg = (url: string) => {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    };
    app.innerHTML = `
      <main class="stage">
        <header class="stage-head">
          <div><span class="logo">PROMPT QUEST</span><span class="tag">Agent Arena · Tu prompt. Tu estrategia. Tu agente.</span></div>
          <div class="chips-row" id="stats"></div>
        </header>
        <section class="board">
          <div class="map"><canvas id="cv"></canvas><div class="overlay" id="ov"></div></div>
          <aside class="side">
            <div class="panel"><div class="match-info" id="info">Esperando la primera partida…</div></div>
            <div class="panel grow"><h3>Qué decide cada agente… y por qué</h3><ul class="feed" id="feed"></ul></div>
            <div class="panel"><h3>Clasificación</h3><ol class="lb" id="lb"></ol></div>
          </aside>
        </section>
        <footer class="stage-foot">
          <div class="qr-block">
            <div class="qr">${qrSvg(joinUrl)}</div>
            <div class="join"><b>Juega: crea tu agente</b><span>${esc(joinUrl.replace(/^https?:\/\//, ''))}</span><small>Escribe una estrategia · una IA la compila · tu agente compite solo</small></div>
          </div>
          <div class="qr-block">
            <div class="qr">${qrSvg(aboutUrl)}</div>
            <div class="join"><b>¿Cómo se hizo?</b><span class="about">Arquitectura, IA y AWS</span><small>Para curiosos y para perfiles técnicos: servicios, seguridad y aprendizajes</small></div>
          </div>
        </footer>
      </main>`;
    window.addEventListener('resize', () => this.renderer?.resize());
    this.poll();
    this.timer = window.setInterval(() => this.poll(), 2000);
    this.loop();
  }
  stop() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
  }

  private async poll() {
    try {
      this.arena = await getArena();
    } catch { return; }
    const a = this.arena;
    $('#stats').innerHTML = `
      <span class="chip-s">🤖 <b>${a.stats.agents}</b> agentes</span>
      <span class="chip-s">✍️ <b>${a.stats.strategies}</b> estrategias</span>
      <span class="chip-s">⚔️ <b>${a.stats.matches}</b> partidas</span>
      <span class="chip-s">🛡️ <b>${a.stats.injectionBlocked}</b> intentos de hackeo bloqueados</span>`;
    $('#lb').innerHTML = a.leaderboard.length
      ? a.leaderboard.map((l) => `<li>${avatar(l.cls, l.el, 26)}<b>${esc(l.name)}</b><span>${l.wins}🏆 · mejor ${l.bestPlace}º · v${l.versions}</span></li>`).join('')
      : '<li class="empty">Aún no hay clasificación. ¡Sé el primero!</li>';
    if (a.current && a.current.id !== this.matchId) {
      this.matchId = a.current.id;
      const rp = await loadReplay(a.current.replayUrl);
      this.replay = rp;
      this.renderer = new ArenaRenderer($<HTMLCanvasElement>('#cv'), rp, { names: true });
      this.lastFrame = -1;
      $('#feed').innerHTML = '';
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const cur = this.arena?.current;
    const ov = $('#ov');
    if (!cur || !this.replay || !this.renderer || cur.id !== this.replay.matchId) {
      ov.hidden = false;
      ov.innerHTML = `<div class="wait"><b>Esperando agentes…</b><small>${this.arena?.lobby.waiting ?? 0} en cola</small></div>`;
      return;
    }
    const r = this.replay;
    const f = (now() - cur.startAt) / cur.turnMs;
    this.renderer.draw(Math.max(0, f));
    const fi = Math.floor(f) + 1;
    const alive = r.frames[Math.max(0, Math.min(r.frames.length - 1, fi))].agents.filter((s) => s[4]).length;
    $('#info').innerHTML = `<b>Partida ${esc(cur.id.slice(-4))}</b> · ${r.agents.filter((x) => !x.isBot).length} humanos + ${r.agents.filter((x) => x.isBot).length} bots<br><span class="big">Turno ${Math.max(0, Math.min(r.turns, fi))}/${r.turns}</span> · <span class="big">${alive}</span> en pie`;
    if (f < 0) {
      ov.hidden = false;
      ov.innerHTML = `<div class="intro"><div class="count">${Math.ceil((-f * cur.turnMs) / 1000)}</div><div class="roster">${r.agents.map((x) => `<span>${avatar(x.cls, x.el, 30)}${esc(x.name)}</span>`).join('')}</div></div>`;
    } else if (f > r.frames.length - 1) {
      ov.hidden = false;
      if (!ov.dataset.done || ov.dataset.done !== cur.id) {
        ov.dataset.done = cur.id;
        ov.innerHTML = `<div class="podium"><h2>🏆 ${esc(cur.winnerName ?? '')}</h2>
          <ol>${cur.podium.map((p) => `<li><b>${p.place}º</b> ${esc(p.name)} <small>${p.score} pts</small></li>`).join('')}</ol>
          <p class="narr">${esc(cur.narration)}</p><small>${cur.narrationSource === 'bedrock' ? '🎙️ Crónica generada por IA a partir de los eventos reales' : '🎙️ Crónica automática'}</small></div>`;
      }
    } else {
      ov.hidden = true;
      ov.dataset.done = '';
    }
    if (fi !== this.lastFrame && f >= 0 && fi < r.frames.length) {
      for (let k = Math.max(1, this.lastFrame + 1); k <= fi; k++) {
        const lines = feedLines(r, k);
        const feed = $('#feed');
        for (const l of lines) {
          const li = document.createElement('li');
          li.className = l.kind;
          li.innerHTML = l.html;
          feed.prepend(li);
        }
        while (feed.children.length > 14) feed.lastElementChild!.remove();
      }
      this.lastFrame = fi;
    }
  };
}

// ----------------------------------------------------------------------------- administración

interface MonitorView {
  now: number;
  auto: boolean;
  config: Record<string, string>;
  counters: { agents: number; ready: number; compiling: number; errors: number; waiting: number; strategies: number; matches: number; injectionBlocked: number; compileCount: number; bedrockCompiles: number; fallbackCompiles: number };
  compile: { samples: number; p50Ms: number; p95Ms: number; maxMs: number };
  current: { id: string; phase: 'countdown' | 'playing' | 'results' | 'finished'; startAt: number; endsAt: number; turns: number; turnMs: number; humans: number; bots: number; simMs: number; participants: string[]; winnerName: string | null } | null;
  recent: { id: string; createdAt: number; winnerName: string | null; humans: number; bots: number; turns: number; simMs: number; narrationSource: string }[];
  agents: { id: string; name: string; cls: ClassId; el: ElementId; status: string; version: number; prompt: string; compiledBy: string | null; compileMs: number | null; injectionAttempts: number; updatedAt: number; queued: boolean; stats: { matches: number; wins: number; bestPlace: number } }[];
}

/** La clave de administración vive solo en sessionStorage: se borra al cerrar la pestaña y nunca se muestra. */
const adminSession = {
  get(): string | null { try { return sessionStorage.getItem('pq.adminKey'); } catch { return null; } },
  set(v: string) { try { sessionStorage.setItem('pq.adminKey', v); } catch { /* sin almacenamiento: habrá que volver a entrar */ } },
  del() { try { sessionStorage.removeItem('pq.adminKey'); } catch { /* */ } },
};

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

class AdminScreen {
  private key = adminSession.get();
  private timer = 0;
  private data: MonitorView | null = null;
  private offset = 0;

  start() {
    if (this.key) this.renderDashboard();
    else this.renderLogin();
  }
  stop() {
    clearInterval(this.timer);
  }

  private call<T>(path: string, init?: RequestInit) {
    return api<T>(path, { ...init, headers: { 'x-admin-key': this.key ?? '', ...(init?.headers ?? {}) } });
  }

  private renderLogin(message = '') {
    clearInterval(this.timer);
    app.innerHTML = `
      <main class="admin-login">
        <form id="login" class="login-card" autocomplete="on">
          <div><span class="logo">PROMPT QUEST</span><span class="tag">Administración</span></div>
          <h1>Acceso del equipo del stand</h1>
          <label class="fld" for="ak"><span>Clave de administración</span>
            <input id="ak" name="password" type="password" autocomplete="current-password" required></label>
          <p class="err" id="err">${esc(message)}</p>
          <button class="cta" type="submit">Entrar</button>
          <small class="hint">La clave solo se guarda en esta pestaña y se borra al cerrarla. En AWS se consulta en Secrets Manager.</small>
        </form>
      </main>`;
    const input = $<HTMLInputElement>('#ak');
    input.focus();
    $<HTMLFormElement>('#login').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = $<HTMLButtonElement>('#login .cta');
      btn.disabled = true;
      this.key = input.value;
      try {
        await this.call('/api/admin/monitor');
        adminSession.set(this.key);
        this.renderDashboard();
      } catch (e) {
        this.key = null;
        input.value = '';
        btn.disabled = false;
        $('#err').textContent = (e as Error).message;
        input.focus();
      }
    });
  }

  private renderDashboard() {
    app.innerHTML = `
      <main class="admin">
        <header class="admin-head">
          <div><span class="logo">PROMPT QUEST</span><span class="tag">Administración</span></div>
          <nav>
            <a href="/#/arena" target="_blank" rel="noopener">Pantalla del público ↗</a>
            <a href="/como-se-hizo.html" target="_blank" rel="noopener">Cómo se hizo ↗</a>
            <button class="btn-s" id="logout">Salir</button>
          </nav>
        </header>
        <section class="admin-top">
          <div class="panel control">
            <h3>Control del stand</h3>
            <div class="mode-row"><span>Modo automático</span><span class="state-pill" id="mode-pill">…</span></div>
            <div class="seg" role="group" aria-label="Modo automático">
              <button id="auto-on" type="button">Activar</button>
              <button id="auto-off" type="button">Desactivar</button>
            </div>
            <button class="cta" id="launch" type="button">▶ Lanzar partida ahora</button>
            <p class="hint">Con el modo automático, cada partida empieza al terminar la anterior (unos 45 s). Al desactivarlo, la partida en curso termina con normalidad.</p>
          </div>
          <div class="panel" id="current"></div>
          <div class="panel" id="config"></div>
        </section>
        <section class="admin-kpis" id="kpis"></section>
        <section class="panel"><h3>Agentes <small id="agents-count"></small></h3><div class="table-scroll"><table class="admin-table" id="agents"></table></div></section>
        <section class="panel"><h3>Últimas partidas</h3><div class="table-scroll"><table class="admin-table" id="matches"></table></div></section>
        <section class="panel danger">
          <h3>Reiniciar todos los datos</h3>
          <p class="hint">Para dejar el stand limpio justo antes del evento: borra todos los agentes (los jugadores perderán el suyo), partidas, replays y clasificación, pone a cero los contadores y desactiva el modo automático. No se puede deshacer.</p>
          <div class="danger-row">
            <label class="fld" for="reset-word"><span>Escribe <b>REINICIAR</b> para confirmar</span>
              <input id="reset-word" autocomplete="off" spellcheck="false"></label>
            <button class="btn-danger" id="reset" type="button" disabled>Reiniciar datos</button>
          </div>
        </section>
        <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
      </main>`;
    $('#logout').onclick = () => {
      adminSession.del();
      this.key = null;
      this.renderLogin('Sesión cerrada.');
    };
    const act = async (path: string, body: unknown, ok: string) => {
      try {
        await this.call(path, { method: 'POST', body: JSON.stringify(body) });
        this.toast(ok);
        await this.poll();
      } catch (e) {
        this.toast((e as Error).message, true);
      }
    };
    $('#auto-on').onclick = () => act('/api/admin/auto', { on: true }, 'Modo automático activado');
    $('#auto-off').onclick = () => act('/api/admin/auto', { on: false }, 'Modo automático desactivado');
    $('#launch').onclick = () => act('/api/admin/match', {}, 'Partida lanzada: empieza en unos segundos');
    const word = $('#reset-word') as HTMLInputElement;
    const reset = $('#reset') as HTMLButtonElement;
    word.oninput = () => (reset.disabled = word.value.trim() !== 'REINICIAR');
    reset.onclick = async () => {
      reset.disabled = true;
      try {
        const r = await this.call<{ agents: number; matches: number; replays: number }>('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: word.value.trim() }) });
        word.value = '';
        this.toast(`Datos reiniciados: ${r.agents} agentes, ${r.matches} partidas y ${r.replays} replays borrados`);
        await this.poll();
      } catch (e) {
        this.toast((e as Error).message, true);
        reset.disabled = word.value.trim() !== 'REINICIAR';
      }
    };
    this.poll();
    this.timer = window.setInterval(() => this.poll(), 3000);
  }

  private toast(text: string, error = false) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = text;
    t.className = `toast${error ? ' error' : ''}`;
    t.hidden = false;
    clearTimeout(Number(t.dataset.timer));
    t.dataset.timer = String(window.setTimeout(() => (t.hidden = true), 3500));
  }

  private async poll() {
    try {
      this.data = await this.call<MonitorView>('/api/admin/monitor');
      this.offset = this.data.now - Date.now();
      this.paint();
    } catch (e) {
      const msg = (e as Error).message;
      if (/clave/i.test(msg)) {
        adminSession.del();
        this.key = null;
        this.renderLogin('La clave ha cambiado o la sesión ha caducado.');
      } else this.toast(`Sin conexión con el servidor: ${msg}`, true);
    }
  }

  private paint() {
    const d = this.data!;
    const t = Date.now() + this.offset;
    const pill = $('#mode-pill');
    pill.textContent = d.auto ? 'Activado' : 'Desactivado';
    pill.className = `state-pill ${d.auto ? 'on' : 'off'}`;
    $('#auto-on').classList.toggle('active', d.auto);
    $('#auto-off').classList.toggle('active', !d.auto);
    $<HTMLButtonElement>('#auto-on').disabled = d.auto;
    $<HTMLButtonElement>('#auto-off').disabled = !d.auto;

    const c = d.current;
    const phase = c
      ? {
          countdown: `Cuenta atrás · empieza en ${Math.max(0, Math.ceil((c.startAt - t) / 1000))} s`,
          playing: `En juego · turno ${Math.min(c.turns, Math.max(1, Math.floor((t - c.startAt) / c.turnMs) + 1))} de ${c.turns}`,
          results: 'Mostrando el podio',
          finished: 'Terminada',
        }[c.phase]
      : 'Sin partidas todavía';
    $('#current').innerHTML = `
      <h3>Partida actual</h3>
      <p class="phase phase-${c?.phase ?? 'none'}">${esc(phase)}</p>
      ${c ? `<dl class="kv">
        <dt>Partida</dt><dd class="mono">${esc(c.id)}</dd>
        <dt>Jugadores</dt><dd>${c.humans} humanos + ${c.bots} bots</dd>
        <dt>Simulación</dt><dd>${c.simMs} ms · ${c.turns} turnos</dd>
        <dt>Termina</dt><dd>${c.endsAt > t ? `en ${Math.ceil((c.endsAt - t) / 1000)} s` : ago(t - c.endsAt)}</dd>
        ${c.winnerName ? `<dt>Ganador</dt><dd>🏆 ${esc(c.winnerName)}</dd>` : ''}
      </dl>` : ''}`;
    $('#config').innerHTML = `<h3>Configuración</h3><dl class="kv">${Object.entries(d.config).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

    const k = d.counters;
    const kpi = (v: string | number, label: string, warn = false) => `<div class="kpi-a${warn ? ' warn' : ''}"><b>${v}</b><span>${label}</span></div>`;
    $('#kpis').innerHTML = [
      kpi(k.agents, 'agentes'),
      kpi(k.waiting, 'en cola'),
      kpi(k.compiling, 'compilando', k.compiling > 5),
      kpi(k.strategies, 'estrategias'),
      kpi(k.matches, 'partidas'),
      kpi(k.injectionBlocked, 'hackeos bloqueados'),
      kpi(`${k.bedrockCompiles} / ${k.fallbackCompiles}`, 'compilaciones IA / respaldo', k.fallbackCompiles > 0 && d.config.Compilador === 'Amazon Bedrock'),
      kpi(d.compile.samples ? `${fmtMs(d.compile.p50Ms)} · ${fmtMs(d.compile.p95Ms)}` : '—', 'compilación p50 · p95'),
    ].join('');

    $('#agents-count').textContent = `(${d.agents.length})`;
    const status = (a: MonitorView['agents'][number]) =>
      a.status === 'compiling' ? '<span class="tag-s amber">compilando</span>' : a.status === 'error' ? '<span class="tag-s red">error</span>' : a.queued ? '<span class="tag-s blue">en cola</span>' : '<span class="tag-s green">listo</span>';
    $('#agents').innerHTML = `
      <thead><tr><th>Agente</th><th>Estado</th><th class="num">Versión</th><th class="num">Partidas</th><th class="num">Victorias</th><th class="num">Mejor</th><th>Compilado</th><th>Hackeo</th><th>Actualizado</th></tr></thead>
      <tbody>${d.agents.length ? d.agents.map((a) => `<tr>
        <td><div class="who">${avatar(a.cls, a.el, 26)}<div><b>${esc(a.name)}</b><small title="${esc(a.prompt)}">${esc(a.prompt)}</small></div></div></td>
        <td>${status(a)}</td>
        <td class="num">v${a.version}</td><td class="num">${a.stats.matches}</td><td class="num">${a.stats.wins}</td><td class="num">${a.stats.bestPlace ? `${a.stats.bestPlace}º` : '—'}</td>
        <td>${a.compiledBy ? `${a.compiledBy === 'bedrock' ? 'IA' : 'respaldo'}${a.compileMs !== null ? ` · ${fmtMs(a.compileMs)}` : ''}` : '—'}</td>
        <td>${a.injectionAttempts ? `🛡️ ${a.injectionAttempts}` : '—'}</td>
        <td>${ago(t - a.updatedAt)}</td></tr>`).join('') : '<tr><td colspan="9" class="empty">Todavía no hay agentes. Comparte el QR de la pantalla del público.</td></tr>'}</tbody>`;
    $('#matches').innerHTML = `
      <thead><tr><th>Partida</th><th>Inicio</th><th>Ganador</th><th class="num">Jugadores</th><th class="num">Turnos</th><th class="num">Simulación</th><th>Crónica</th></tr></thead>
      <tbody>${d.recent.length ? d.recent.map((m) => `<tr>
        <td class="mono">${esc(m.id)}</td><td>${ago(t - m.createdAt)}</td><td>${m.id === c?.id && !c.winnerName ? '<span class="muted">en curso</span>' : esc(m.winnerName ?? '—')}</td>
        <td class="num">${m.humans} + ${m.bots}🤖</td><td class="num">${m.turns}</td><td class="num">${m.simMs} ms</td><td>${m.narrationSource === 'bedrock' ? 'IA' : 'plantilla'}</td></tr>`).join('') : '<tr><td colspan="7" class="empty">Sin partidas todavía.</td></tr>'}</tbody>`;
  }
}

// ----------------------------------------------------------------------------- enrutado

let current: { stop(): void } | null = null;
function route() {
  current?.stop();
  const h = location.hash;
  const mode = h.startsWith('#/arena') ? 'stage' : h.startsWith('#/admin') ? 'admin' : 'phone';
  document.body.className = `${mode}-mode`;
  const s = mode === 'stage' ? new ArenaScreen() : mode === 'admin' ? new AdminScreen() : new PlayerScreen();
  current = s;
  s.start();
}
window.addEventListener('hashchange', route);
route();
