# Prompt Quest · Hallazgos y plan de operación

15 de octubre de 2026 · Héctor Guzmán

## Resumen

El prototipo aguanta un evento de unas 300 personas. Pero con 60–100 jugadores a la vez aparecen tres cuellos de botella:

- Cada jugador juega solo cada 5–6 minutos.
- La cola premia demasiado a quien edita su estrategia.
- La API puede rechazar peticiones a partir de unos 100 móviles conectados.

Todos los datos salen de simulaciones con el motor y el servicio reales: 2.000 partidas para la duración y 5 escenarios de una hora con 100 jugadores para la cola. Los tiempos de Bedrock y el comportamiento de los jugadores son supuestos que hay que validar en AWS.

Antes del evento se recomienda:

1. Cambiar la prioridad de la cola a «tiempo desde tu última partida», con la edición como bonificación y no como pase prioritario.
2. Subir el límite de la API y espaciar las consultas de los móviles que solo esperan.
3. Añadir un **modo pico**, activable desde la consola de administración. Acorta el ciclo de partida de 50 a 33 s, da un 51 % más de plazas por hora y endurece la equidad.
4. Hacer un ensayo con compañeros y una prueba de carga en AWS antes del día del evento.

## Hallazgos

La capacidad está limitada por la duración del ciclo (unos 50 s con 16 agentes). La política de cola actual solo es justa si todos los jugadores se comportan igual.

### 1. Duración de una partida

En pantalla, una partida dura: cuenta atrás (8 s) + turnos × 0,65 s + podio (14 s). Los turnos dependen del número de agentes y de lo agresivas que sean sus estrategias. El tope es el turno 50, que equivale a 54,5 s en pantalla. Datos de 600 partidas simuladas por escenario:

| Escenario | Turnos (media) | En pantalla (media) | Rango habitual (p10–p90) | Llegan al turno 50 |
| --- | --- | --- | --- | --- |
| 10 agentes, estrategias variadas | 36,9 | 46 s | 42–52 s | 6 % |
| 16 agentes, estrategias variadas | 41,1 | 49 s | 44–55 s | 13 % |
| 10 agentes, todos agresivos | 29,2 | 41 s | 38–44 s | 0 % |
| 10 agentes, todos defensivos | 47,1 | 53 s | 49–55 s | 46 % |
| 16 agentes, todos defensivos | 47,5 | 53 s | 49–55 s | 52 % |

Entre partidas hay hasta 3 s más hasta el siguiente *tick*.

### 2. Capacidad

Caben 16 jugadores por partida: unas 1.150 plazas por hora. Con 100 personas presentes, cada una juega cada 5–6 minutos y, en una avalancha, la última en entrar espera unos 5 minutos.

### 3. Equidad de la cola (100 jugadores, 60 minutos)

La prioridad actual es: estrategia sin estrenar, después menos partidas jugadas, después más tiempo esperando. El índice de Jain mide el reparto: 1,00 es perfecto y 0,5 muy desigual.

| Escenario | Partidas por jugador | Jain | Espera hasta la 1.ª partida | Mayor hueco sin jugar |
| --- | --- | --- | --- | --- |
| A · 100 a la vez, nadie edita | 11–12 | 1,00 | media 2 min 45 s · máx. 5 min | ~6 min |
| B · 100 a la vez, el 50 % edita tras cada resultado | 10–15 | 1,00 | media 2 min 47 s · máx. 5 min | máx. 28 min |
| C · 100 a la vez, todos editan siempre | 11–12 | 1,00 | media 2 min 46 s · máx. 5 min | ~6 min |
| D · 30 editan siempre, 70 nunca | editores 27,3 · resto 4,6 | 0,55 | media 2 min 41 s · máx. 5 min | ~16 min para quien no edita |
| E · llegadas a lo largo de 45 min, el 50 % edita | 11–43 por hora de presencia | 0,87 | media 33 s · máx. 62 s | máx. 50 min |

Editar da prioridad absoluta. En el escenario D quien edita juega 6 veces más, y quien no edita puede pasar más de media hora sin jugar.

Supuestos de la simulación: compilación de unos 2 s con 5 en paralelo, quien edita tarda 30–90 s tras ver su resultado y todos se quedan la hora completa.

### 4. Otros hallazgos

- **Edición aprovechable.** Guardar el mismo prompt cuenta como versión nueva: basta pulsar «Mejorar» sin cambiar nada para colarse. Además, cada edición gasta una llamada a Bedrock.
- **Tope oculto.** Quien edita tras cada partida alcanza el límite de 30 versiones en unos 70 minutos y pierde la prioridad de golpe.
- **Avalancha mal aprovechada.** La primera partida sale con los pocos agentes ya compilados (unos 5) y el resto espera un ciclo entero.
- **Límite de la API.** Cada móvil consulta su agente cada 2 s, sin caché. Así, 100 móviles generan 50 peticiones por segundo, justo el límite configurado (50/s, ráfagas de 100).
- **Sin estimación de espera.** El móvil dice «en la cola», pero no la posición ni cuánto falta.
- **Agentes de gente que se fue.** Siguen jugando como relleno. Dan vida a la arena, pero ocupan plazas y puestos en la clasificación.
- **Sin moderación desde la consola.** El administrador ve los nombres y prompts, pero no puede ocultar un agente.

## Modo normal y modo pico

El modo pico es la misma arena con parámetros que priorizan la rotación de jugadores sobre el espectáculo. Se activa desde la consola de administración cuando la cola crece y se vuelve al modo normal cuando baja.

### Parámetros

| Parámetro | Normal | Pico | Por qué |
| --- | --- | --- | --- |
| Velocidad de reproducción (`turnMs`) | 650 ms por turno | 500 ms por turno | Partidas más ágiles, todavía legibles en pantalla |
| Cuenta atrás | 8 s | 5 s | Menos tiempo muerto |
| Podio y crónica | 14 s | 8 s | Menos tiempo muerto |
| Turnos máximos | 50 | 40 | Recorta las partidas largas de estrategias defensivas |
| La zona empieza a cerrarse | turno 10 | turno 6 | Fuerza el desenlace antes |
| Crónica de la partida | IA (Bedrock) | Plantilla | No espera a Bedrock al lanzar cada partida y deja la cuota para compilar |
| Agentes por partida | 16 | 16 | 20 o más exige un mapa mayor y reequilibrar (fase 2) |
| Prioridad de la cola | Tiempo desde la última partida + 60 s si hay estrategia nueva | Tiempo desde la última partida + 30 s, y como máximo una edición prioritaria por partida jugada | Nadie se queda sin jugar; editar ayuda, pero no permite colarse |
| Ventana de lobby | No | Hasta 10 s o 16 agentes listos | Aprovecha las avalanchas |
| Relleno con agentes de gente ausente | Sí | Solo agentes con actividad en los últimos 15 min | Las plazas son para quien está en el stand |
| Consulta del móvil mientras espera | Cada 2 s | Cada 5 s | Reduce la carga de la API |

Independientemente del modo, conviene subir el límite de la API a unas 200 peticiones/s (ráfagas de 400). Solo se paga por petición.

### Efecto medido (800 partidas simuladas por modo)

| Medida | Normal | Pico |
| --- | --- | --- |
| Turnos de media (16 agentes) | 40,9 | 37,2 |
| Tiempo de juego | 26,6 s | 18,6 s |
| Ciclo completo por partida | 50,1 s (46–56 s) | 33,1 s (31–35 s) |
| Plazas por hora | ~1.150 | ~1.740 (+51 %) |
| Con 100 jugadores presentes, cada uno juega cada | ~5,2 min | ~3,4 min |
| Espera máxima en una avalancha de 100 | ~5 min | ~3,5 min |

Contrapartidas:
- En el modo pico más partidas terminan por puntos en el turno 40 (el 10 % de las partidas llega al tope) y hay menos tiempo para leer la crónica.
- Cerrar la zona antes puede cambiar el equilibrio entre clases, así que hay que validarlo con `npm run sim`.
- El coste de IA baja (sin crónicas) aunque se jueguen más partidas.

### Cuándo activarlo

- **Manual:** un selector Normal / Pico en la consola de administración.
- **Sugerencia automática:** un aviso en la consola cuando hay 32 o más agentes en cola (dos partidas llenas), o la espera estimada supera 3 minutos durante dos partidas seguidas.
- **Vuelta al modo normal:** cuando la cola baja de 16 agentes durante 5 minutos. Dejar un margen entre el umbral de entrada y el de salida evita que el sistema oscile entre modos.

### Cómo encaja en la arquitectura

- El modo se guarda en el estado de la arena (DynamoDB), junto al modo automático.
- `startMatch` elige los parámetros del motor y los tiempos según el modo.
- Cambiar de modo en mitad del evento es seguro: cada partida ya guarda su propio `turnMs`, `startAt` y `endsAt`, y los clientes reproducen cada partida con sus propios tiempos.

## Escenarios previstos y plan de acción

| Escenario | Cómo se detecta | Acción inmediata | Prevención |
| --- | --- | --- | --- |
| Avalancha: 50–100 registros en 1–2 min | «En cola» y «compilando» se disparan en la consola | Activar el modo pico. No lanzar partidas manuales: el modo automático ya las encadena | Ventana de lobby; posición y espera estimada en el móvil |
| Afluencia sostenida mayor que la capacidad | La cola crece durante más de 3 partidas; espera de más de 3 min | Modo pico. Anunciar en el stand «una partida cada ~35 s» | Segunda arena con otra pantalla, o 20 agentes por partida (fase 2) |
| Bedrock lento | Compilación p95 por encima de 10 s en la consola | Nada urgente: la cola lo absorbe. Si supera 30 s, pasar la crónica a plantilla (modo pico) | Pedir con antelación un aumento de cuota de Bedrock |
| Bedrock caído o sin acceso al modelo | En la consola crece «respaldo» en el contador IA/respaldo (se resalta) | El juego sigue con el compilador de respaldo. Avisar en el stand de que la IA funciona en modo reducido | Probar el acceso al modelo el día antes; tener preparado un modelo alternativo (`-c modelId=...`) |
| Limitación de cuota en Bedrock (errores 429) | Errores en CloudWatch Logs; crece «respaldo» | Bajar la concurrencia de compilación a 2–3; el respaldo cubre el resto | Cuota solicitada con antelación; ignorar ediciones sin cambios |
| Wi-Fi del recinto saturada | Los móviles no cargan; la pantalla no se actualiza | Pedir que usen datos móviles (el QR funciona igual). Pantalla del stand por cable o compartiendo datos desde un móvil | La web ya es ligera (20 KB). Probar la red en el recinto el día antes |
| Demasiados móviles para la API (más de 100) | Errores 429 en las métricas de API Gateway | Subir el límite y redesplegar (minutos) | Límite de 200/s y consultas espaciadas antes del evento |
| Nombre ofensivo en pantalla | Tabla de agentes de la consola | Hoy no hay botón para ocultarlo: editar el registro en DynamoDB a mano | Añadir «ocultar agente» a la consola; ampliar el filtro de nombres |
| Oleada de intentos de inyección | Contador de hackeos bloqueados | Nada: es parte del juego. Vigilar el coste | Ya cubierto por la validación y el respaldo |
| Gasto inesperado | Alerta de AWS Budgets por correo | Revisar en la consola las ediciones y compilaciones. Modo pico, o redesplegar con `-c compiler=heuristic` | Ignorar ediciones sin cambios; limitar ediciones por minuto |
| Pantalla del stand colgada | Imagen congelada | Recargar la pestaña: no se pierde nada, el estado vive en el servidor | Navegador en modo quiosco; portátil de respaldo con la pantalla abierta |
| Stand con poca gente | Cola en 0 | El modo automático sigue con bots, que atraen a curiosos. El equipo puede crear agentes de ejemplo | Bots con estrategias variadas (ya incluidos) |
| Un jugador pierde acceso a su agente (cambió de navegador o borró datos) | Lo comenta en el stand | Que cree otro agente: hoy no hay recuperación | Opcional: código corto de recuperación |
| Fallo del despliegue o de la región el día del evento | La web no carga | Plan C: la versión local en el portátil del stand (`npm run dev`) en la red del stand | Desplegar y congelar la versión dos días antes; no desplegar el mismo día |

## Propuestas de mejora priorizadas

| Prioridad | Propuesta | Qué resuelve | Esfuerzo | Impacto |
| --- | --- | --- | --- | --- |
| P1 | Prioridad por tiempo desde la última partida, con bonificación por edición | Equidad: en el escenario D, 4,6 frente a 27,3 partidas | Bajo | Alto |
| P1 | Ignorar ediciones sin cambios y limitar las ediciones prioritarias | Trampa para colarse y gasto de Bedrock | Bajo | Medio |
| P1 | Límite de la API a 200/s y consultas espaciadas mientras se espera | Errores con más de 100 móviles | Bajo | Alto |
| P1 | Modo pico: selector en la consola y parámetros en el estado | +51 % de plazas por hora | Medio | Alto |
| P2 | Posición en la cola y espera estimada en el móvil | Incertidumbre del jugador | Bajo–medio | Alto en experiencia |
| P2 | Ventana de lobby en avalanchas | Primera partida casi vacía | Bajo | Medio |
| P2 | Ocultar o moderar un agente desde la consola | Contenido ofensivo | Bajo | Medio |
| P2 | Excluir agentes inactivos del relleno y de la clasificación | Plazas y clasificación | Bajo | Medio |
| P3 | Sugerencia automática del modo pico | Reacción tardía del equipo | Medio | Medio |
| P3 | Simulación de cola en el repositorio (`npm run sim:queue`) | Validar cada cambio de política | Bajo | Medio |
| P3 | Segunda arena o 20 agentes por partida | Más de 150 personas a la vez | Alto | Alto si hay mucho público |

## Pendiente de validar y próximos pasos

- [ ] Medir la latencia y el coste reales de Bedrock (`scripts/try-bedrock.ts`) en la región elegida.
- [ ] Confirmar el acceso a Claude Haiku 5.5 en esa región y dejar configurado un modelo alternativo.
- [ ] Prueba de carga contra AWS simulando 150 móviles (API y CloudFront).
- [ ] Revisar el equilibrio de clases con los parámetros del modo pico (zona desde el turno 6) con `npm run sim`.
- [ ] Ensayo con 10–20 compañeros: legibilidad a 500 ms por turno y comprensión del informe.
- [ ] Comprobar el Wi-Fi y la cobertura móvil del recinto.
- [ ] Repetir la simulación de equidad tras cambiar la política de cola.
