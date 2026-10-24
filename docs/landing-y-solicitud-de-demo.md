# S13 · Landing y solicitud real de demo

Implementada en `feature/s13-landing-y-solicitud-de-demo`, creada desde `main` actualizado con S12 integrado (`d9c3a7d`). La landing sustituye la entrada provisional y conecta el formulario con la API existente de S05. No incorpora variables, paquetes ni migraciones.

## Contenido y límites

La apertura presenta chips forestales, un retorno compatible y dos acciones independientes: **Probar demo** navega a `/demo`; **Book a demo** lleva a `/#book-a-demo`. No se exige contacto para explorar. S13 no crea sesiones ni recorridos: el inicio operativo y las mutaciones siguen en S14; QR y contraste remoto desde la página, en S15.

`src/app/page.tsx` es un Server Component. Usa `createScenarioSnapshot()` y `calculateEconomics()` de S02; no consulta SQL, sesión ni Hedera. El build prerenderiza `/`. El escenario inicial de 12.000 kg muestra material ARS 216.000,00, retorno ARS 90.000,00 y coordinación ARS 18.000,00: total ARS 324.000,00 frente a ARS 381.000,00 con flete dedicado; diferencia ilustrativa ARS 57.000,00. Los resultados no se duplican como constantes de UI. Los importes se formatean desde cadenas decimales y BigInt.

Después del caso aparecen los supuestos económicos, cuatro participantes simulados, recorrido con recepción/rechazo/incidencia, explicación de registro y testnet, contacto y localizador existente de trazabilidad. Los textos distinguen datos ficticios, solicitud real, guardado SQL y confirmación de red. El QR consulta; no confirma retiro ni entrega. No hay promesas comerciales, certificación física, impacto ambiental ni ahorro observado.

La fotografía local `chips-pile.jpg` se sirve mediante `next/image` con dimensiones intrínsecas, `sizes` y precarga. Alt, atribución, fuente y licencia proceden del manifest S02. Se conserva el archivo original; CSS adapta el encuadre. Se indica que es una referencia ajena a una carga real. Barlow Semi Condensed 600 se sirve con `next/font/local`; el archivo y su licencia OFL están en `src/app/fonts/`, obtenidos del [catálogo oficial google/fonts](https://github.com/google/fonts/tree/main/ofl/barlowsemicondensed). No se consultan servicios de fuentes al compilar o navegar.

## Formulario e intención de guardado

`DemoRequestForm` controla nombre, email, empresa y mensaje opcional. `src/shared/demo-request-schema.ts` comparte validación, normalización y mensajes con el parser servidor de S05; no cambia sus reglas, huella ni persistencia. Los campos llevan etiquetas, límites, autocompletado, ayudas y errores asociados. La validación devuelve el foco al primer campo inválido.

Cada envío lógico captura un UUID y el JSON normalizado exacto en memoria. Mensaje vacío se omite en el JSON. El transporte POST exclusivo a `/api/demo-requests` usa origen propio, cabecera de protección, JSON, `no-store`, rechazo de redirects y timeout de 15 segundos. No modifica el lector GET de S12 ni importa secretos/Prisma/SDK en el cliente. El formulario declara `method="post"` para impedir que una entrega sin JavaScript serialice contactos en la URL; el contrato JSON de la API requiere JavaScript y rechaza ese envío nativo.

| Resultado | Comportamiento |
| --- | --- |
| Validación local | Conserva campos, muestra errores, no envía. |
| En curso | Guarda lógica síncrona contra doble clic; bloquea campos y acción mientras espera. |
| 200/201 con UUID, fecha ISO y mensaje esperado válidos | Confirma guardado, limpia datos personales y permite iniciar otra solicitud. |
| 400 `INVALID_INPUT` o 403 `REQUEST_FORBIDDEN` | Conserva campos, habilita corrección y descarta la intención rechazada. |
| Red, timeout, 503, 500, respuesta inválida u otro resultado incierto | Conserva JSON/UUID exactos, bloquea edición y permite solo reintento manual de la misma intención. Nunca confirma por inferencia. |
| 409 `IDEMPOTENCY_CONFLICT` | Explica conflicto y posible duplicado; requiere acción explícita para iniciar otra intención. |
| 410 `DEMO_REQUEST_EXPIRED` | Explica vencimiento; requiere acción explícita para iniciar otra intención. |

No hay reintentos automáticos, correo, agenda, CRM ni lectura pública de contactos. La confirmación solo dice que la solicitud quedó guardada y muestra la fecha del servidor. Los errores usan el catálogo de aplicación y pueden mostrar su UUID diagnóstico, distinto de la clave de intención.

El borrador y la intención viven únicamente en memoria: sobreviven a errores dentro de la página, pero se pierden al recargar, cerrar o salir de ella. No se usan localStorage/sessionStorage, URLs, logs ni HCS para esos datos. Al desmontar se aborta la espera y se ignoran resultados tardíos; abortar no garantiza cancelar una escritura que ya llegó al servidor. La retención de contactos continúa siendo 90 días y borrado en la siguiente ejecución diaria exitosa; S05/S10 conservan esa responsabilidad.

## Direction contract

Registro de la dirección elegida por el usuario en la planificación. El comando `surface-brief` no estuvo operativo en este entorno (salida 1 sin contenido); este documento conserva el contrato para futuras iteraciones.

THESIS: ficha de abastecimiento industrial que conecta un material concreto con un retorno y una comparación económica explicada. El beneficio debe entenderse antes de hablar de la red.

OWN-WORLD: superficie clara, tinta petróleo, interacción teal y amarillo señal reservado a la selección; títulos Barlow Semi Condensed 600 y cuerpo del sistema. Reglas, cifras alineadas y espacios organizan la ficha sin sombras decorativas.

STORY: entender el caso ficticio y sus supuestos, reconocer cuatro participantes y elegir entre explorar la demo o solicitar conocer el prototipo. Diferenciar acción SQL, pendiente y confirmación testnet.

FIRST VIEWPORT: título y explicación con ambos CTA junto a la fotografía local del material; ficha de cantidad/humedad y diferencia ilustrativa integrada al cierre de la apertura. En móvil, orden lineal título/acciones, foto y ficha, sin desplazar la acción detrás de secciones posteriores.

FORM: dirección «Ficha de abastecimiento industrial», elegida explícitamente por el usuario; construcción directa en código, no desde un comp. seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verificación y trabajo pendiente

Pasaron `npm run typecheck`, `npm run db:validate` y `npm run build`. La revisión estática comprobó extracción equivalente del schema S05, aislamiento de imports cliente, cargas locales, ausencia de reintento automático y confirmación condicionada a respuesta válida. Se corrigieron kickers/numeración decorativa y franja lateral identificados por la revisión de diseño.

**Veredicto visual: `recapture`.** No hay capturas de escritorio/móvil: la herramienta UI devuelve `apps: []`, `browsers: []`. Quedan pendientes revisión a 1440/390 px, foto cargada, overflow, foco, teclado y estados reales de envío. Ni el build ni la inspección estática acreditan esos criterios. El sistema implementado está documentado en `DESIGN.md` y `.impeccable/design.json`; no equivale a aprobación visual.

No se crearon ni ejecutaron suites, solicitudes, sesiones, datos SQL, mantenimiento o transacciones testnet para esta entrega. S17/S18 verificarán la persistencia observable y los recorridos de navegador: validación, envío exitoso, doble clic, error que conserva campos, respuesta perdida/reintento idéntico, conflicto/vencimiento, navegación, accesibilidad y móvil. No se hizo commit, push ni despliegue.
