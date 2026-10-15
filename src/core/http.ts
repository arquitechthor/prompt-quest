import { timingSafeEqual } from 'node:crypto';
import { ArenaService, HttpError } from './service';

// Router HTTP agnóstico del transporte: lo usan la Lambda (API Gateway) y el servidor local.

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string | null;
}
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const json = (status: number, data: unknown, cacheSeconds = 0): HttpResponse => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
  },
  body: JSON.stringify(data),
});

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** adminKey puede ser un valor o una función asíncrona (en AWS se lee de Secrets Manager y se cachea). */
export async function handleHttp(svc: ArenaService, req: HttpRequest, adminKey: string | (() => Promise<string>)): Promise<HttpResponse> {
  const { method } = req;
  const path = req.path.replace(/\/+$/, '');
  const h = (k: string) => req.headers[k] ?? req.headers[k.toLowerCase()];
  let body: Record<string, unknown> = {};
  if (req.body) {
    if (req.body.length > 4000) return json(413, { error: 'Petición demasiado grande' });
    try {
      body = JSON.parse(req.body);
    } catch {
      return json(400, { error: 'JSON no válido' });
    }
  }
  const isAdmin = async () => {
    const expected = typeof adminKey === 'function' ? await adminKey() : adminKey;
    const k = h('x-admin-key') ?? '';
    return expected.length > 0 && safeEq(k, expected);
  };
  try {
    let m: RegExpMatchArray | null;
    if (method === 'GET' && path === '/api/arena') return json(200, await svc.arena(), 2);
    if (method === 'POST' && path === '/api/agents') return json(201, await svc.createAgent(body));
    if ((m = path.match(/^\/api\/agents\/([A-Za-z0-9]{4,12})$/))) {
      if (method === 'GET') return json(200, await svc.getAgent(m[1]));
      if (method === 'PUT') return json(200, await svc.updateAgent(m[1], h('x-edit-token'), body));
    }
    if (method === 'GET' && (m = path.match(/^\/api\/matches\/([A-Za-z0-9-]{4,40})$/))) return json(200, await svc.getMatch(m[1]), 60);
    if (path.startsWith('/api/admin/')) {
      if (!(await isAdmin())) return json(401, { error: 'Clave de administración incorrecta' });
      if (method === 'GET' && path === '/api/admin/monitor') return json(200, await svc.monitor());
      if (method === 'POST' && path === '/api/admin/match') return json(200, { match: await svc.startMatch({ allowBotOnly: true }) });
      if (method === 'POST' && path === '/api/admin/auto') return json(200, await svc.setAuto(body.on === true));
      if (method === 'POST' && path === '/api/admin/tick') return json(200, await svc.tick());
    }
    return json(404, { error: 'No encontrado' });
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: 'Error interno' });
  }
}
