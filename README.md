# Prompt Quest: Agent Arena

Arena de agentes autónomos cuyo comportamiento lo dicta un prompt. Cada participante escribe una estrategia en lenguaje natural; un LLM en Amazon Bedrock la **compila** a una política estructurada; un motor determinista la ejecuta en partidas de hasta 16 agentes que se ven en directo en una pantalla grande y en los móviles.

> Idea original: [idea/prompt_quest_agent_arena.md](idea/prompt_quest_agent_arena.md)

## Probarlo en local (gratis, sin AWS)

```bash
npm install
npm run dev
```

- Jugador (móvil): http://localhost:5173
- Pantalla del stand: http://localhost:5173/#/arena?admin (clave `local-admin`; botón **Auto** para encadenar partidas)

En local se usa el compilador heurístico de respaldo. Para usar Bedrock con tus credenciales: `COMPILER=bedrock npm run dev`.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas: determinismo, saneado de políticas, inyección, impacto del prompt |
| `npm run sim -- 2000` | Simula 2.000 partidas: rendimiento y equilibrio de clases, elementos y estrategias |
| `npx tsx scripts/try-bedrock.ts` | Compila prompts de ejemplo contra Bedrock y mide la latencia |
| `npm run typecheck` | Comprobación de tipos de TypeScript |

## Arquitectura

```
Móvil / Pantalla ──► CloudFront ─┬─► S3 (web estática)
                                 ├─► S3 (replays inmutables)
                                 └─► API Gateway HTTP ──► Lambda api ──► DynamoDB
                                                             └─► SQS ──► Lambda compile ──► Bedrock (Claude)
EventBridge (1/min) ──► Lambda tick ──► motor de juego (~3 ms/partida) ──► S3 + DynamoDB (+ crónica con Bedrock)
```

Ideas clave:

1. **El LLM compila, no interpreta.** Una llamada a Bedrock por estrategia, no una por movimiento: 99,9 % menos llamadas, sin latencia durante la partida y con comportamiento reproducible.
2. **Simular una vez, reproducir en todas partes.** La partida se calcula entera en milisegundos y se publica como fichero estático e inmutable en CloudFront. Todos los clientes la reproducen sincronizados con `startAt`, sin WebSockets, y el coste del backend no depende del número de espectadores.
3. **El prompt es dato no confiable.** Se usa un vocabulario cerrado (DSL), salida estructurada con JSON Schema y saneado en servidor. Los intentos de inyección se detectan y se muestran como parte del juego.
4. **Degradación elegante.** Si Bedrock falla o tarda, el compilador heurístico toma el relevo, la cola SQS limita la concurrencia hacia Bedrock y la DLQ recoge los fallos.
5. **Arquitectura hexagonal.** El mismo dominio ([src/core](src/core), [src/engine](src/engine)) corre en local con ficheros y en AWS con DynamoDB, S3, SQS y Bedrock.

```
src/engine   motor determinista, reglas, DSL de políticas, compilador heurístico, bots
src/core     servicio de dominio, puertos, router HTTP, compilador/narrador Bedrock
src/adapters adaptadores locales (ficheros) y AWS (DynamoDB, S3, SQS)
src/lambda   handlers api / compile / tick
src/web      frontend (móvil + pantalla del stand), canvas sin frameworks
infra        stack CDK
```

## Desplegar en AWS

Requisitos: una cuenta de AWS con acceso a Bedrock y al modelo de Anthropic habilitado en la región elegida (consola de Bedrock, apartado **Model access**).

### Opción A: AWS CloudShell (sin instalar nada ni permisos de administrador en tu equipo)

1. En tu equipo, empaqueta el código sin dependencias (PowerShell):
   ```powershell
   Compress-Archive -Path src,infra,scripts,package.json,package-lock.json,tsconfig.json,cdk.json -DestinationPath prompt-quest.zip -Force
   ```
2. Abre CloudShell en la consola de AWS, en la región deseada (p. ej. `eu-west-1`), y sube el zip (Actions → Upload file).
3. Ejecuta:
   ```bash
   mkdir prompt-quest && cd prompt-quest && unzip ../prompt-quest.zip
   npm ci
   npx cdk bootstrap          # solo la primera vez por cuenta y región
   npm run deploy -- -c alertEmail=tu@email.com -c adminKey=una-clave-secreta
   ```
4. Los *outputs* muestran la URL pública, la URL de la pantalla del stand y la clave de administración.

### Opción B: desde tu equipo

Crea una clave de acceso de IAM y exporta las variables (PowerShell):

```powershell
$env:AWS_ACCESS_KEY_ID="..."; $env:AWS_SECRET_ACCESS_KEY="..."; $env:CDK_DEFAULT_REGION="eu-west-1"
npx cdk bootstrap
npm run deploy -- -c alertEmail=tu@email.com
```

### Parámetros (`-c clave=valor`)

| Parámetro | Por defecto | Descripción |
|---|---|---|
| `modelId` | `anthropic.claude-haiku-5-5` | Modelo de Bedrock. Si no está disponible en tu región, usa un perfil de inferencia (p. ej. `eu.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| `bedrockRegion` | región del stack | Región en la que se invoca Bedrock |
| `compiler` | `bedrock` | `heuristic` para desplegar sin usar el LLM (coste de IA cero) |
| `narration` | `bedrock` | `template` para desactivar la crónica generada por IA |
| `adminKey` | aleatoria | Clave para lanzar partidas y activar el modo automático |
| `alertEmail` / `budgetUsd` | — / 20 | Crea un presupuesto de AWS con alertas al 50, 80 y 100 % |

Para borrarlo todo: `npm run destroy`. No quedan costes fijos: no hay NAT, bases de datos aprovisionadas ni contenedores.

## Coste estimado

Escenario de evento: 300 participantes, unas 900 estrategias compiladas y unas 640 partidas en 8 horas. Coste orientativo de IA: entre 0,6 y 7 USD según el modelo y el precio de Bedrock en tu región. Infraestructura: menos de 4 USD. Sin uso, el coste es prácticamente cero. Los precios deben verificarse en la [página de precios de Amazon Bedrock](https://aws.amazon.com/bedrock/pricing/).
