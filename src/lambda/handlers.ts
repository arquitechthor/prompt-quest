import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DynamoStore, S3ReplayStore, SqsQueue } from '../adapters/aws';
import { HeuristicCompiler } from '../adapters/local';
import { BedrockCompiler } from '../core/bedrock';
import { handleHttp } from '../core/http';
import { ArenaService } from '../core/service';

// Tres puntos de entrada, un único dominio:
//   api     <- API Gateway (HTTP API) vía CloudFront
//   compile <- SQS (desacopla y limita la concurrencia hacia Bedrock)
//   tick    <- EventBridge Scheduler (cada minuto lanza la siguiente partida si el modo automático está activo)

const env = (k: string, d = '') => process.env[k] ?? d;
const useBedrock = env('COMPILER', 'bedrock') === 'bedrock';
const ai = useBedrock ? new BedrockCompiler({ region: env('BEDROCK_REGION', env('AWS_REGION')), modelId: env('MODEL_ID', 'anthropic.claude-haiku-5-5') }) : new HeuristicCompiler(0);

const svc = new ArenaService({
  store: new DynamoStore(env('TABLE')),
  replays: new S3ReplayStore(env('DATA_BUCKET')),
  queue: new SqsQueue(env('QUEUE_URL')),
  compiler: ai,
  narrator: env('NARRATION', 'bedrock') === 'bedrock' ? ai : new HeuristicCompiler(0),
  info: {
    Entorno: `AWS Lambda · ${env('AWS_REGION')}`,
    Compilador: useBedrock ? 'Amazon Bedrock' : 'heurístico',
    Modelo: useBedrock ? env('MODEL_ID', 'anthropic.claude-haiku-5-5') : '—',
    'Región de Bedrock': useBedrock ? env('BEDROCK_REGION', env('AWS_REGION')) : '—',
    Crónica: env('NARRATION', 'bedrock') === 'bedrock' ? 'Amazon Bedrock' : 'plantilla',
  },
});

// La clave de administración vive en Secrets Manager: se lee una vez por contenedor y se cachea.
let adminKeyCache: Promise<string> | null = null;
const adminKey = () =>
  (adminKeyCache ??= env('ADMIN_SECRET_ARN')
    ? new SecretsManagerClient({})
        .send(new GetSecretValueCommand({ SecretId: env('ADMIN_SECRET_ARN') }))
        .then((r) => r.SecretString ?? '')
        .catch((e) => {
          adminKeyCache = null;
          throw e;
        })
    : Promise.resolve(env('ADMIN_KEY')));

interface ApiEvent {
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string>;
  requestContext: { http: { method: string } };
}

export async function api(event: ApiEvent) {
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : null;
  const res = await handleHttp(svc, { method: event.requestContext.http.method, path: event.rawPath, headers: event.headers ?? {}, body }, adminKey);
  return { statusCode: res.status, headers: res.headers, body: res.body };
}

export async function compile(event: { Records: { body: string; messageId: string }[] }) {
  const failures: { itemIdentifier: string }[] = [];
  for (const rec of event.Records) {
    try {
      const { agentId, version } = JSON.parse(rec.body);
      await svc.processCompile(agentId, version);
    } catch (err) {
      console.error(err);
      failures.push({ itemIdentifier: rec.messageId });
    }
  }
  return { batchItemFailures: failures };
}

/**
 * EventBridge lo invoca una vez por minuto. Si el modo automático está apagado sale al instante (coste ~0).
 * Si está encendido, encadena partidas dentro de ese minuto para que no haya huecos en la pantalla del stand.
 */
export async function tick(_event: unknown, context?: { getRemainingTimeInMillis(): number }) {
  const deadline = Date.now() + Math.min(58_000, (context?.getRemainingTimeInMillis() ?? 60_000) - 5_000);
  const results: unknown[] = [];
  while (Date.now() < deadline) {
    const r = await svc.tick();
    results.push(r);
    if (r.reason === 'auto-off') break;
    await new Promise((res) => setTimeout(res, 3_000));
  }
  console.log(JSON.stringify({ evt: 'tick', results: results.filter((r) => (r as { started?: boolean }).started) }));
  return { ticks: results.length };
}
