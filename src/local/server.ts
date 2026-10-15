import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { FileReplayStore, FileStore, HeuristicCompiler, InProcessQueue } from '../adapters/local';
import { BedrockCompiler } from '../core/bedrock';
import { handleHttp } from '../core/http';
import { ArenaService } from '../core/service';

// Servidor de desarrollo: misma lógica que en AWS, con adaptadores locales.
//   npm run dev                         -> compilador heurístico (gratis, sin credenciales)
//   COMPILER=bedrock npm run dev        -> usa Bedrock con tus credenciales AWS locales

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = resolve('.');
const DATA = join(ROOT, '.data');
const WEB = join(ROOT, 'dist', 'web');
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'local-admin';

const queue = new InProcessQueue();
const ai =
  process.env.COMPILER === 'bedrock'
    ? new BedrockCompiler({ region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'eu-west-1', modelId: process.env.MODEL_ID ?? 'anthropic.claude-haiku-5-5' })
    : new HeuristicCompiler();
const useBedrock = process.env.COMPILER === 'bedrock';
const svc = new ArenaService({
  store: new FileStore(DATA), replays: new FileReplayStore(join(DATA, 'replays')), queue, compiler: ai, narrator: ai,
  info: {
    Entorno: 'local (ficheros en .data/)',
    Compilador: useBedrock ? 'Amazon Bedrock' : 'heurístico',
    Modelo: useBedrock ? (process.env.MODEL_ID ?? 'anthropic.claude-haiku-5-5') : '—',
    Crónica: useBedrock ? 'Amazon Bedrock' : 'plantilla',
  },
});
queue.handler = (id, v) => svc.processCompile(id, v);

// En AWS esto lo hace EventBridge cada minuto; en local, cada 3 s.
setInterval(() => svc.tick().catch((e) => console.error(e)), 3000);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await handleHttp(svc, { method: req.method ?? 'GET', path: url.pathname, headers: req.headers as Record<string, string>, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : null }, ADMIN_KEY);
    res.writeHead(r.status, r.headers).end(r.body);
    return;
  }
  const base = url.pathname.startsWith('/replays/') ? DATA : WEB;
  let file = normalize(join(base, decodeURIComponent(url.pathname)));
  if (!file.startsWith(base)) return res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`\n  Prompt Quest en http://localhost:${PORT}`);
  console.log(`  Pantalla del público: http://localhost:${PORT}/#/arena`);
  console.log(`  Administración:       http://localhost:${PORT}/#/admin   (clave en local: ${ADMIN_KEY})`);
  console.log(`  Cómo se hizo:         http://localhost:${PORT}/como-se-hizo.html`);
  console.log(`  Compilador: ${process.env.COMPILER === 'bedrock' ? 'Amazon Bedrock' : 'heurístico local (sin coste)'}\n`);
});
