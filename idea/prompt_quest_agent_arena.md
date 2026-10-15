# Prompt Quest: Agent Arena

**Tu prompt. Tu estrategia. Tu agente. Una arena. Un solo campeón.**

## 1. Visión general

Prompt Quest es una arena multijugador de agentes autónomos en la que cada participante crea un personaje, define su comportamiento mediante lenguaje natural y lo enfrenta a otros agentes en un mundo de exploración, recursos y combate.

Cada participante configura:

- **Nombre:** la identidad de su agente.
- **Personaje:** una de las cuatro clases disponibles.
- **Elemento:** una afinidad elemental que modifica ligeramente sus capacidades y su apariencia.
- **Estrategia:** un prompt que describe cómo debe comportarse el agente.

Después de registrarse, el sistema transforma la estrategia en una política ejecutable. El agente participa en partidas sin intervención humana, explora el mapa, recoge mejoras, toma decisiones y compite por la victoria.

La idea central es que **el personaje define lo que el agente puede hacer; el prompt define cómo decide hacerlo**. Dos participantes pueden elegir el mismo avatar y obtener resultados distintos gracias a sus estrategias.

### Objetivos del proyecto

1. Crear una experiencia divertida, fácil de entender y accesible para personas con distintos niveles de conocimiento técnico.
2. Demostrar cómo una instrucción en lenguaje natural puede convertirse en el comportamiento de un agente autónomo.
3. Representar conceptos de IA, arquitectura de software y AWS mediante una experiencia práctica.
4. Permitir que los participantes experimenten, comparen resultados y mejoren sus estrategias.
5. Desarrollar una experiencia viable para un evento en el que se quiere mostrar el poder de la tecnología y la IA.

---

## 2. Bucle principal de juego

La experiencia se organiza en cinco fases:

1. **Crear:** el participante registra el nombre, personaje, elemento y estrategia de su agente.
2. **Preparar:** el sistema interpreta el prompt y lo convierte en una política estructurada y validada.
3. **Explorar:** el agente se desplaza por un mapa, descubre zonas y busca recursos.
4. **Competir:** los agentes se encuentran, toman decisiones y utilizan sus habilidades.
5. **Aprender y mejorar:** se muestran los resultados y el participante puede modificar su prompt para disputar otra partida.

Las partidas son automáticas una vez iniciadas. Los participantes no controlan manualmente los movimientos durante el enfrentamiento.

---

## 3. Clases de personaje

Cada clase tiene una función diferenciada, una habilidad pasiva, una habilidad especial y una debilidad. Las estadísticas definitivas deben equilibrarse mediante pruebas de juego.

### 3.1. Arquero

**Rol:** especialista en distancia y precisión.

El Arquero puede atacar desde lejos y castigar a los rivales antes de que consigan acercarse. Es eficaz en zonas abiertas y cuando puede mantener una distancia favorable.

- **Habilidad pasiva — Ojo de halcón:** mayor alcance de ataque.
- **Habilidad especial — Disparo certero:** ataque potente a distancia con un tiempo de recarga.
- **Debilidad:** vulnerable cuando un rival consigue acercarse.
- **Estilo de juego:** mantener distancias, elegir objetivos y evitar quedar acorralado.

### 3.2. Guerrero

**Rol:** especialista en fuerza y combate directo.

El Guerrero domina los enfrentamientos cercanos gracias a su capacidad ofensiva y su resistencia.

- **Habilidad pasiva — Fortaleza:** mayor salud inicial o resistencia al daño.
- **Habilidad especial — Golpe devastador:** ataque cuerpo a cuerpo de gran potencia.
- **Debilidad:** menor movilidad y dificultad para alcanzar a enemigos rápidos.
- **Estilo de juego:** buscar enfrentamientos favorables, controlar posiciones y aprovechar su resistencia.

### 3.3. Ninja

**Rol:** especialista en velocidad y evasión.

El Ninja se desplaza rápidamente, escapa de situaciones peligrosas y puede sorprender a sus oponentes.

- **Habilidad pasiva — Reflejos:** mayor movilidad y probabilidad de esquivar.
- **Habilidad especial — Sombra fugaz:** desplazamiento rápido que permite reposicionarse.
- **Debilidad:** menor resistencia en combates prolongados.
- **Estilo de juego:** atacar y retirarse, flanquear y aprovechar los errores de los rivales.

### 3.4. Explorador

**Rol:** especialista en exploración y recursos.

El Explorador encuentra mejoras, descubre rutas y aprovecha los recursos repartidos por el mapa antes que sus rivales.

- **Habilidad pasiva — Rastreador:** detecta power-ups desde mayor distancia.
- **Habilidad especial — Saqueo experto:** obtiene un beneficio adicional de determinados recursos.
- **Debilidad:** menor ventaja en enfrentamientos directos.
- **Estilo de juego:** explorar pronto, acumular mejoras y evitar combates innecesarios hasta estar preparado.

### Principio de equilibrio

Cada clase debe ser competitiva, pero por caminos diferentes:

- El Arquero controla la distancia.
- El Guerrero domina el combate cercano.
- El Ninja controla el ritmo y la movilidad.
- El Explorador optimiza su preparación y la adquisición de recursos.

Ninguna clase debería ganar automáticamente a otra. El resultado debe depender también del elemento, el mapa, los recursos y la estrategia del participante.

---

## 4. Elementos y avatares

El juego dispone de cuatro elementos: **Fuego, Agua, Tierra y Aire**. Cada elemento tiene una identidad visual y un efecto mecánico moderado.

El elemento modifica ligeramente las capacidades del personaje, pero no reemplaza su función principal. Un Guerrero de Aire sigue siendo un Guerrero, aunque con una orientación algo más móvil.

### 4.1. Fuego

- **Paleta visual:** rojo, naranja, brasas y llamas.
- **Identidad:** ofensiva y presión constante.
- **Efecto propuesto:** algunos ataques aplican quemadura, que causa una pequeña cantidad de daño adicional durante varios turnos.

### 4.2. Agua

- **Paleta visual:** azul, turquesa y corrientes líquidas.
- **Identidad:** adaptación y recuperación.
- **Efecto propuesto:** puede obtener una pequeña bonificación defensiva o recuperarse ligeramente al activar una habilidad elemental.

### 4.3. Tierra

- **Paleta visual:** verde, marrón, roca y cristales.
- **Identidad:** resistencia y estabilidad.
- **Efecto propuesto:** puede reducir ligeramente el daño recibido u obtener protección temporal.

### 4.4. Aire

- **Paleta visual:** blanco, plata, celeste y remolinos.
- **Identidad:** movilidad y libertad táctica.
- **Efecto propuesto:** puede obtener una pequeña bonificación de movimiento o evasión.

### 4.5. Matriz de los 16 avatares

| Personaje | Fuego | Agua | Tierra | Aire |
|---|---|---|---|---|
| Arquero | Arquero Ígneo | Arquero de Marea | Arquero de Jade | Arquero del Vendaval |
| Guerrero | Guerrero Infernal | Guerrero Abisal | Guerrero de Obsidiana | Guerrero Celeste |
| Ninja | Ninja Carmesí | Ninja de la Niebla | Ninja de Piedra | Ninja del Vendaval |
| Explorador | Explorador de Brasas | Explorador de Mareas | Explorador Silvano | Explorador de la Tormenta |

Los nombres son provisionales. Cada combinación debe tener una silueta reconocible y elementos visuales propios, como armas, partículas, colores y animaciones. Para el MVP se recomienda utilizar avatares gráficos predefinidos en lugar de generar imágenes nuevas durante cada registro.

### 4.6. Ciclo de ventajas elementales

Se propone el siguiente ciclo de contrajuego:

- **Fuego vence a Aire.**
- **Aire vence a Tierra.**
- **Tierra vence a Agua.**
- **Agua vence a Fuego.**

Este ciclo es una decisión de diseño, no una simulación de leyes físicas. La ventaja debe ser moderada —por ejemplo, una bonificación del 10 % al daño elemental— y aplicarse solo a acciones relevantes. No debe conceder una victoria automática.

El equilibrio definitivo debe validarse mediante partidas de prueba y análisis de las tasas de victoria de cada combinación.

---

## 5. Mapa y entorno

El juego utiliza un mapa cuadriculado con niebla de guerra, obstáculos, zonas de peligro y tesoros. La disposición del mapa puede variar entre partidas.

### Elementos del mapa

- **Power-ups:** pociones de salud, escudos, botas de velocidad, mejoras de ataque y energía elemental.
- **Tesoros:** otorgan puntos y, ocasionalmente, objetos especiales.
- **Obstáculos:** muros, rocas, ríos y pasillos que condicionan los movimientos y los ataques.
- **Zonas de peligro:** áreas que se vuelven progresivamente más peligrosas para evitar partidas interminables.
- **Pistas:** rastros, sonidos o señales que ayudan a decidir si explorar, huir o atacar.

### Información y niebla de guerra

Cada agente debe actuar a partir de la información que realmente puede percibir. No debería conocer automáticamente todo el mapa ni la posición exacta de todos los rivales.

La información disponible puede depender de la clase, las habilidades, la distancia y los eventos del juego. Por ejemplo, el Explorador puede detectar recursos desde mayor distancia y el Arquero puede detectar amenazas dentro de su campo de visión.

### Condición de victoria

El objetivo principal es ser el último agente en pie. Si se alcanza el límite de turnos, gana el agente con la mejor puntuación combinada de:

- Supervivencia.
- Objetivos completados.
- Recursos conseguidos.
- Rendimiento durante los enfrentamientos.

La fórmula de puntuación debe definirse antes de implementar el motor y mantenerse igual para todos los participantes.

---

## 6. Reglas básicas de una partida

### 6.1. Inicio

- Se seleccionan los agentes registrados para la partida.
- Todos comienzan con estadísticas iniciales equilibradas.
- El motor asigna las posiciones iniciales.
- Se genera o selecciona el mapa.
- Los agentes reciben únicamente la información inicial que les corresponde.

### 6.2. Turnos

En cada turno, los agentes pueden elegir entre acciones permitidas por las reglas del juego, como:

- Moverse.
- Explorar.
- Recoger un objeto.
- Atacar.
- Defenderse.
- Utilizar una habilidad.
- Recuperarse o esperar.

Las acciones exactas dependen del estado del agente, su clase, sus recursos y las reglas del motor.

### 6.3. Resolución

El motor valida las acciones, determina el orden de ejecución y aplica sus efectos. Debe resolver de forma consistente las colisiones, el alcance, los obstáculos, el daño, las habilidades, los efectos elementales y las eliminaciones.

### 6.4. Fin de partida

La partida termina cuando queda un único agente activo o cuando se alcanza el límite de turnos. Se calculan las puntuaciones y se publica el resultado.

### Duración y tamaño inicial

Como objetivo inicial para el MVP, se proponen partidas de entre **30 y 60 turnos**, con **máximo 16 agentes por partida** para que todos puedan verse diferente. Son valores de partida para las pruebas, no requisitos definitivos: deben ajustarse según el rendimiento, el ritmo de juego y la duración real de cada enfrentamiento.

---

## 7. El prompt: la estrategia del participante

El participante no necesita programar. Describe el comportamiento deseado en lenguaje natural, como si estuviera dando instrucciones a un jugador.

### Ejemplo 1: El francotirador

- **Personaje:** Arquero.
- **Elemento:** Fuego.
- **Estrategia:**

> Mantén siempre la mayor distancia posible respecto a tus enemigos. Busca zonas abiertas, recoge mejoras de ataque y dispara solo cuando tengas una línea de visión favorable. Si un rival se acerca demasiado, retrocede antes de atacar.

**Conceptos:** planificación espacial, selección de objetivos y gestión de distancias.

### Ejemplo 2: El superviviente

- **Personaje:** Guerrero.
- **Elemento:** Tierra.
- **Estrategia:**

> No inicies combates si tienes menos del 70 % de salud. Prioriza escudos y curación. Cuando un enemigo esté debilitado o haya gastado su habilidad especial, acércate y busca un enfrentamiento decisivo.

**Conceptos:** gestión de riesgo, umbrales de decisión y conservación de recursos.

### Ejemplo 3: El oportunista

- **Personaje:** Ninja.
- **Elemento:** Aire.
- **Estrategia:**

> Evita atacar a enemigos con salud completa. Sigue los enfrentamientos desde una posición segura y entra cuando dos rivales estén debilitados. Utiliza tu habilidad de movilidad para escapar si el combate deja de ser favorable.

**Conceptos:** decisiones contextuales, posicionamiento y aprovechamiento de oportunidades.

### Ejemplo 4: El cazatesoros

- **Personaje:** Explorador.
- **Elemento:** Agua.
- **Estrategia:**

> Durante los primeros turnos, explora las zonas desconocidas y recoge mejoras. Evita enfrentamientos salvo que tengas una ventaja clara. Cuando estés bien equipado, busca rivales aislados y prioriza objetivos que te acerquen a la victoria.

**Conceptos:** exploración, planificación a largo plazo y optimización de recursos.

### Principios para procesar los prompts

El sistema debe respetar la intención del participante, pero el prompt no puede conceder habilidades inexistentes ni saltarse las reglas.

La estrategia se transforma en una política estructurada con prioridades, umbrales y condiciones. El agente propone acciones y el motor comprueba si son legales antes de ejecutarlas.

Los prompts deben tratarse como entrada no confiable. No se debe ejecutar código arbitrario enviado por los participantes ni permitir que las instrucciones alteren las reglas, las estadísticas o el estado del juego.

---

## 8. Arquitectura de agentes autónomos

La solución debe separar tres responsabilidades principales.

### 8.1. Capa de estrategia

El participante escribe su prompt. Un modelo de IA convierte esa descripción en una política estructurada y validada, con prioridades, objetivos, umbrales y reglas de comportamiento.

Esta fase puede utilizar Amazon Bedrock. La política resultante se guarda para que la partida no tenga que interpretar el prompt original en cada turno.

### 8.2. Capa del agente

En cada turno, el agente recibe una observación limitada del entorno, evalúa su política y selecciona una acción permitida. Las decisiones pueden resolverse mediante reglas deterministas, lo que permite una ejecución rápida y reproducible.

La autonomía consiste en que el agente selecciona sus acciones sin intervención humana durante la partida. No es necesario invocar un modelo generativo en cada movimiento para que el agente sea autónomo.

### 8.3. Capa del motor de juego

El motor:

- Valida las acciones.
- Resuelve movimientos y combates.
- Aplica las habilidades y ventajas elementales.
- Actualiza el mapa y los recursos.
- Determina las eliminaciones.
- Calcula puntuaciones y resultados.

Los agentes no pueden modificar directamente el estado de la partida.

### 8.4. Flujo lógico

```text
Participante
    |
    v
Formulario de creación
    |
    v
Prompt en lenguaje natural
    |
    v
Modelo de IA: interpretación de estrategia
    |
    v
Política estructurada y validada
    |
    v
Agente autónomo <---- Observación del entorno
    |
    v
Acción propuesta
    |
    v
Motor de juego: validación y resolución
    |
    v
Nuevo estado de la partida
    |
    +------> Siguiente turno
    |
    v
Resultado y clasificación
```

### 8.5. Uso de modelos en tiempo de ejecución

Para el MVP, se recomienda evitar llamadas a modelos generativos en cada turno. Pueden incrementar la latencia, el coste y la variabilidad del comportamiento.

Una evolución futura podría incluir un modo avanzado en el que el modelo razone durante la partida. Ese modo debería tener límites de consumo, tiempos máximos de respuesta y una política de respaldo si el modelo falla.

---

## 9. Arquitectura propuesta en AWS

La aplicación puede implementarse con una arquitectura serverless, apropiada para un prototipo de uso temporal y demanda variable.

### Componentes

| Componente | Responsabilidad |
|---|---|
| Amazon S3 | Alojar los archivos estáticos de la aplicación web. |
| Amazon CloudFront | Distribuir la aplicación y servirla mediante HTTPS. |
| Amazon API Gateway | Exponer las APIs del registro, las partidas y los resultados. |
| AWS Lambda | Ejecutar la lógica de registro, preparación, coordinación y consulta. |
| Amazon Bedrock | Interpretar los prompts y generar políticas de estrategia estructuradas. |
| Amazon DynamoDB | Guardar agentes, políticas, partidas, eventos y resultados. |

La arquitectura exacta debe ajustarse después de definir los requisitos de concurrencia y el motor de juego. No es necesario crear una Lambda por cada responsabilidad si eso añade complejidad sin aportar valor al MVP.

### Flujo de registro

1. El participante abre la aplicación web.
2. Completa el formulario de creación.
3. La API valida el contenido y registra la configuración inicial.
4. Una función Lambda solicita a Bedrock la conversión del prompt en una política estructurada.
5. El sistema valida el resultado y lo guarda en DynamoDB.
6. El agente queda listo para participar.

### Flujo de una partida

1. El motor selecciona los agentes y prepara el estado inicial.
2. En cada turno, obtiene la observación correspondiente a cada agente.
3. La política de cada agente determina la acción propuesta.
4. El motor valida y resuelve las acciones.
5. Se actualiza el estado de la partida.
6. El frontend consulta y muestra la evolución.
7. Al terminar, se guardan los resultados y se actualiza la clasificación.

### Consideraciones técnicas

- Definir límites de llamadas, tokens y coste para Bedrock.
- Establecer límites de tamaño y longitud de los prompts.
- Validar todas las políticas antes de utilizarlas.
- Evitar que los participantes puedan modificar agentes ajenos.
- Aplicar límites de concurrencia y tiempos de ejecución.
- Preparar un mecanismo de respaldo si Bedrock no está disponible.
- Evitar llamadas a servicios cloud para resolver cada movimiento si puede hacerlo el motor local de la partida.
- Diseñar el acceso al estado de la partida para que soporte los espectadores previstos.

---

## 10. Experiencia de usuario

La interfaz debe priorizar la sencillez. La mayoría de los asistentes deberían poder crear un agente en menos de un minuto.

### Formulario de creación

Campos principales:

1. **Nombre:** nombre visible del agente.
2. **Personaje:** Arquero, Guerrero, Ninja o Explorador.
3. **Elemento:** Fuego, Agua, Tierra o Aire.
4. **Estrategia:** texto libre que describe el comportamiento deseado.

La apariencia se deriva de la combinación de personaje y elemento. En el MVP, no hace falta generar imágenes dinámicamente.

### Arena

La pantalla de la arena puede mostrar:

- Mapa y posiciones visibles.
- Avatares y animaciones.
- Salud y estado de los agentes.
- Movimientos, ataques y recogida de objetos.
- Eventos importantes de la partida.
- Agentes eliminados y clasificación provisional.

El juego no necesita una pantalla física en el stand para funcionar. Los participantes pueden acceder desde sus propios móviles. Si el evento dispone de una pantalla común, la arena puede proyectarse como experiencia a más espectadores.

### Resultado de la partida

Al terminar, el participante debería poder consultar:

- Posición final y puntuación.
- Supervivencia y objetivos completados.
- Objetos conseguidos y eliminaciones.
- Eventos que influyeron en el resultado.
- Resumen de la estrategia declarada.
- Una sugerencia de mejora para el siguiente intento.

Las explicaciones deben derivarse de los eventos reales del motor. No deben atribuir al agente motivos que no puedan justificarse con sus decisiones y observaciones.

---

## 11. Aprendizaje adicional

Prompt Quest puede aportar valor educativo en varias áreas.

| Área | Aprendizaje |
|---|---|
| IA generativa | Cómo las instrucciones condicionan el comportamiento de un agente. |
| Agentes autónomos | Cómo definir objetivos, prioridades, observaciones y acciones. |
| AWS | Cómo desplegar una aplicación serverless y gestionar un servicio compartido. |
| Microservicios | Cómo separar responsabilidades mediante interfaces y contratos claros. |
| Experimentación | Cómo medir resultados, comparar estrategias y mejorar mediante iteraciones. |
| Seguridad | Por qué los agentes necesitan permisos limitados y un entorno de ejecución controlado. |

El aprendizaje principal es que **un buen prompt no garantiza una buena estrategia**. El resultado depende de las reglas, la información disponible, los recursos y los rivales. Por eso es importante evaluar el comportamiento observado, no solamente la calidad aparente de las instrucciones.

### Informe posterior a la partida

Cada partida puede generar un informe breve con cuatro apartados:

- **Estrategia declarada:** qué pretendía hacer el participante.
- **Comportamiento observado:** qué acciones ejecutó realmente.
- **Resultado:** puntuación, supervivencia, eficiencia o contribución.
- **Lección:** qué decisión fue determinante y qué podría mejorarse.

Ejemplo: «Tu estrategia priorizaba el combate, pero tu agente gastó su habilidad especial contra un rival con mucha salud y quedó vulnerable durante el siguiente turno».

---

## 12. Seguridad, equidad y robustez

El sistema debe aplicar las mismas reglas a todos los participantes.

- Los agentes solo pueden ejecutar acciones incluidas en el conjunto permitido.
- Los prompts no pueden cambiar estadísticas, reglas, resultados ni información oculta.
- Las instrucciones de los participantes no deben ejecutarse como código.
- La información del mapa se limita a lo que el agente puede percibir.
- Las partidas deben utilizar reglas y parámetros consistentes.
- El motor debe registrar los eventos necesarios para investigar resultados inesperados.
- Deben existir límites para prevenir prompts excesivamente largos, abuso de llamadas y consumo descontrolado.
- Si la generación de políticas falla, el sistema debe permitir reintentar o utilizar una estrategia predeterminada claramente identificada.

Para reducir la latencia y mejorar la equidad, conviene preparar todas las políticas antes de comenzar una partida y ejecutar las acciones con un motor controlado.

---

## 13. Alcance recomendado del MVP

La primera versión debe demostrar un ciclo completo de principio a fin, en lugar de intentar incorporar todas las características posibles.

### Funcionalidades incluidas

- Cuatro clases de personaje.
- Cuatro elementos y 16 combinaciones visuales.
- Un mapa cuadriculado con niebla de guerra.
- Obstáculos, power-ups y zonas de peligro.
- Movimiento y combate por turnos.
- Un conjunto limitado de acciones y habilidades.
- Formulario de registro de agentes.
- Conversión del prompt a una política estructurada.
- Partidas de 8–16 agentes como objetivo inicial.
- Visualización de la partida y resultados.
- Clasificación y posibilidad de modificar el prompt para volver a competir.

### Fuera del alcance inicial

- Generación de ilustraciones personalizadas en tiempo real.
- Ejecución de código arbitrario enviado por participantes.
- Razonamiento de un modelo generativo en cada movimiento.
- Mapas enormes o mundos persistentes.
- Alianzas complejas, negociación entre agentes o multijugador en tiempo real.
- Un sistema de clasificación competitivo permanente.

Estas características pueden evaluarse una vez validado el núcleo del juego.

---

## 14. Plan de implementación por fases

### Fase 1 — Diseñar las reglas

- Definir estadísticas, acciones y turnos.
- Especificar el mapa y la condición de victoria.
- Establecer el ciclo elemental.
- Definir el modelo de datos de los agentes y las partidas.

**Criterio de salida:** reglas suficientemente precisas para implementar el motor sin ambigüedades importantes.

### Fase 2 — Construir el motor

- Implementar mapa, movimiento, visión y obstáculos.
- Implementar clases, elementos, habilidades y power-ups.
- Implementar combate y condiciones de fin.
- Añadir pruebas automatizadas y partidas simuladas.

**Criterio de salida:** partidas completas que se ejecutan sin interfaz y producen resultados reproducibles bajo una semilla fija.

### Fase 3 — Crear las políticas

- Definir el formato estructurado de estrategia.
- Implementar la conversión de prompts.
- Validar las políticas generadas.
- Crear estrategias predeterminadas como alternativa.
- Comparar el comportamiento de distintas políticas.

**Criterio de salida:** los prompts generan políticas válidas y diferenciadas que producen comportamientos observables.

### Fase 4 — Construir el frontend

- Crear el formulario.
- Mostrar el avatar y su configuración.
- Dibujar el mapa y los eventos.
- Mostrar los resultados y la clasificación.
- Optimizar la experiencia para móviles.

**Criterio de salida:** un usuario puede registrar un agente y observar una partida completa desde el navegador.

### Fase 5 — Integrar y desplegar en AWS

- Desplegar el frontend en S3 y CloudFront.
- Crear APIs con API Gateway y Lambda.
- Integrar Bedrock y DynamoDB.
- Configurar permisos, límites y observabilidad.
- Probar errores, concurrencia y consumo.

**Criterio de salida:** el flujo completo funciona en un entorno de prueba y tiene mecanismos de respaldo.

### Fase 6 — Prueba del evento

- Simular el número previsto de participantes.
- Medir duración de registro y preparación.
- Ajustar la duración de las partidas.
- Revisar el equilibrio de clases y elementos.
- Ensayar el funcionamiento con conectividad limitada.
- Preparar instrucciones y una estrategia de contingencia.

**Criterio de salida:** el juego puede operar durante el evento con un procedimiento claro para resolver incidencias.

---

## 15. Métricas de éxito

Para saber si la experiencia funciona, conviene medir tanto la participación como la calidad del juego.

- Número de agentes registrados.
- Porcentaje de participantes que completan el registro.
- Tiempo medio desde el envío del formulario hasta que el agente está listo.
- Tiempo medio de una partida.
- Número de participantes que modifican su prompt y vuelven a jugar.
- Distribución de victorias por clase y elemento.
- Errores de generación de políticas y partidas.
- Consumo y coste de los servicios cloud.
- Valoraciones de los participantes.

Las métricas deben servir para mejorar la experiencia, no para recopilar datos personales innecesarios. Para el evento, bastan identificadores de juego y nombres visibles elegidos por los participantes; no es necesario solicitar información sensible.

---

## 16. Evoluciones futuras

Una vez validado el MVP, se podrían añadir:

- Torneos con eliminatorias.
- Nuevos mapas y desafíos.
- Modos de juego cooperativos.
- Un modo avanzado con razonamiento de IA durante la partida.
- Herramientas de análisis para comparar estrategias.
- Retos de temporada con reglas distintas.
- Una vista que explique cómo una estrategia en lenguaje natural se transforma en una política ejecutable.
- Variantes educativas centradas en resiliencia, sostenibilidad o arquitectura de microservicios.

---

## 17. Definición final del producto

> **Prompt Quest es una arena multijugador de agentes autónomos en la que cada participante crea un personaje, define su comportamiento mediante lenguaje natural y lo enfrenta a otros agentes en un mundo de exploración, recursos y combate. Cada partida demuestra cómo las estrategias, las capacidades y las decisiones determinan el resultado, mientras una plataforma serverless en AWS convierte las ideas de los participantes en agentes ejecutables.**

La característica central es que, después de cada partida, el participante puede modificar una sola instrucción, volver a competir y comprobar si su agente realmente ha mejorado. Así, el juego se convierte en una experiencia de entretenimiento y, al mismo tiempo, en un experimento práctico de diseño y evaluación de agentes autónomos.
