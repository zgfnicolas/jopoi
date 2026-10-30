# Auditoría de ingeniería full-stack — Jopói

Fecha: 30 de octubre de 2026. Revisión base: `dc8672e02abed9811caf7d8726db67030cff8823`.

La arquitectura tiene una base sólida para la demo: dominio sin I/O, validación runtime, propiedad por sesión, precisión decimal, recibos idempotentes, control de versión y una salida transaccional persistida para publicar eventos. **No alcanza todavía los seis DoD de producción solicitados.** Las prioridades son acotar el consumo de recursos, corregir dependencias vulnerables y poder diagnosticar fallos reales. Reemplazar el monolito modular por microservicios no resolvería esas brechas.

## Alcance y criterio

Se revisaron `src/domain`, `src/shared`, `src/frontend`, componentes y páginas, todos los tipos de Route Handlers, servicios de sesiones/contactos/operaciones/trazas, coordinador HCS, cliente SQL, esquema y cinco migraciones Prisma, configuración, scripts operativos y suites. Se contrastaron las decisiones con `PRODUCT.md`, el ADR de presupuesto cero y la documentación S20/S21. La revisión comprende código y comprobaciones locales; no acredita el despliegue, sus cabeceras efectivas, permisos del proveedor, backups ni métricas de usuarios reales.

Versiones declaradas: Node `>=24 <25`, Next `16.4.2`, React `19.3.1`, TypeScript `7.0.2`, Prisma/adaptador pg `7.10.1`, SDK Hiero `2.90.1`. Se usó Node local `24.22.1`. No corresponde imponer recetas de Prisma 6 ni migrar a Prisma 8 por suposición. Se leyeron las guías instaladas de Next sobre Route Handlers, streaming y CSP.

Estados: **C** = control presente y revisado; **P** = parcial; **F** = requisito aplicable ausente o incumplido; **E** = falta evidencia externa; **NA** = fuera del alcance actual, con motivo. C no significa certificación de todo el estándar.

El pedido enumera rangos RENDER-01–30, API-01–25, PRISMA-01–35 y OBS-01–40, pero no aporta la definición individual de esos identificadores. Esta auditoría cubre los controles descriptos y usa IDs propios `AUD-*`; no inventa correspondencias con esos catálogos. Tampoco interpreta los IDs API de las pruebas del proyecto como IDs del catálogo solicitado. No es una certificación ISO, IEEE, OWASP ni ASVS.

## Comprobaciones de esta ejecución

| Comprobación | Resultado y límite |
| --- | --- |
| `npm run typecheck` | Aprobado con el `tsconfig.json` actual. |
| `tsc --noEmit --incremental false --noUncheckedIndexedAccess --exactOptionalPropertyTypes --pretty false` | **106 diagnósticos**: 47 en `src`, 15 en scripts, 44 en tests/configuración. No se modificó el tsconfig para medirlos. |
| `npm run test:cli` | **19/19 aprobadas**, fuera del sandbox después del fallo de inicialización de tsx dentro de él. |
| `npm run test:ui:tokens` | **2/2 aprobadas**, fuera del sandbox. Verifica tokens y contraste calculado; no sustituye revisión visual ni accesibilidad completa. |
| `npm test` | **43/43 aprobadas**, cinco archivos, 380,33 s. PostgreSQL descartable, rol restringido y HCS controlado; no demuestra testnet ni producción. |
| `npm run lint` | No existe script ni configuración de ESLint/Biome en el inventario revisado. |
| `npm audit --omit=dev --json` | Salida 1: **3 paquetes afectados**, 1 alto y 2 moderados; 0 críticos informados en dependencias de producción. Son dos avisos de `ws` propagados por su cadena, no tres vulnerabilidades independientes. |
| Build, E2E, Lighthouse y benchmark | No se volvieron a ejecutar en esta auditoría. Hay resultados históricos documentados S20/S21, que se distinguen de evidencia nueva. |
| Producción, CDN, TLS/grants efectivos y backups remotos | Sin comprobar en esta ejecución. |

Los diagnósticos y la consulta npm quedan como artefactos locales ignorados en `.cache/audit-strict-diagnostics.txt` y `.cache/audit-dependencies.json`. El primer intento de pruebas falló antes de cargar los casos con `uv_os_get_passwd/ENOMEM`; las corridas autorizadas fuera del sandbox resolvieron esa limitación para CLI y tokens. La suite API también se ejecutó fuera del sandbox para permitir los procesos del arnés local; completó su limpieza y restauró `next-env.d.ts`.

## Hallazgos priorizados

P1: resolver antes de una exposición pública sostenida. P2: completar para el DoD solicitado y antes de ampliar el producto. P3: mejora de mantenibilidad o evolución condicionada al crecimiento. **17 hallazgos: 4 P1, 11 P2 y 2 P3.** No se confirmó un P0.

### AUD-01 · P1 · Mutaciones y lecturas privadas sin admisión acotada

**Evidencia:** [políticas](../src/server/security/rate-limit.ts#L10) sólo para SESSION, CONTACT, VERIFICATION y TRACE; [comandos HTTP](../src/server/operations/http.ts#L54), [intenciones de recorrido](../src/server/sessions/http.ts#L47) y [reintento](../src/server/hedera/retry.ts) no exigen rate limit. [Cada comando nuevo](../src/server/operations/commands.ts#L102) crea un `CommandReceipt`; `save` mantiene DRAFT y puede repetirse con UUID y versión nuevos. La cuota de tres recorridos no limita los recibos. Reintentos con intenciones nuevas también crean recibos aunque no habiliten más envíos HCS.

**Impacto:** una sesión válida puede aumentar escrituras y almacenamiento y disputar el pool de dos conexiones. El cliente no es una frontera: un programa puede aportar Origin y el header esperado. No se ejecutó una prueba destructiva ni se observó abuso real.

**Mejora:** agregá presupuestos durables por sesión/operación y límites globales para lecturas, comandos y activaciones del trabajador, además de protección en el ingreso. Definí un máximo de intenciones por recorrido compatible con la UX. Conservá los recibos necesarios para idempotencia; no los borres arbitrariamente para liberar espacio. La admisión debe limitar el intento antes del trabajo costoso y responder 429 con `Retry-After`.

**Aceptación:** muchas claves distintas y múltiples instancias no superan el presupuesto; los duplicados siguen siendo seguros; lecturas normales conservan capacidad durante una ráfaga de escrituras. Medí filas, conexiones y latencia, además del status.

### AUD-02 · P1 · Capacidad de limpieza inferior al volumen admitido

**Evidencia:** [mantenimiento](../src/server/hedera/maintenance-core.ts#L36) procesa una sola tanda de hasta 100 recorridos/contactos/sesiones y 1.000 buckets por ejecución, dentro de una ventana de limpieza de 15 s; [cron](../vercel.json) una vez por día. SESSION admite hasta 200 solicitudes/10 min globales y CONTACT 100/hora. Con suficientes visitantes pueden aceptarse más de 100 registros diarios. El volumen real desplegado no fue medido.

**Impacto:** ante entradas sostenidas por encima de la capacidad de borrado, crece el atraso de datos vencidos. Además, 100 padres no acotan sus hijos: borrar recorridos por cascada puede eliminar una cantidad grande de recibos y exceder el timeout. La denegación de acceso al vencer está implementada; el riesgo es almacenamiento y demora de eliminación física.

**Mejora:** dimensioná conjuntamente admisión, retención y servicio de limpieza. Repetí lotes pequeños mientras quede presupuesto, reservá tiempo por categoría y hacé visible el atraso y la antigüedad del vencido más viejo. Si el cron diario gratuito no alcanza, ajustá el volumen admitido o explicitá intervención operativa dentro del alcance acordado. No requiere contratar otro plan automáticamente.

**Aceptación:** simulá varios días con reloj controlado y entradas por encima de 100/día; el atraso converge y el trabajo no agota el pool ni revierte repetidamente una cascada demasiado grande. Definí un objetivo separado para vencimiento lógico y eliminación física.

### AUD-03 · P1 · Dependencia transitiva con avisos de seguridad

**Evidencia:** [lockfile](../package-lock.json#L4715) e instalación: SDK `2.90.1` → `ethers 6.16.0` → `ws 8.17.1`. npm informa un aviso alto de agotamiento de memoria y otro moderado de exposición de memoria. El mantenedor identifica `8.21.0` como versión corregida para el DoS y `8.20.1` para el segundo aviso. Fuentes: [aviso DoS](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p), [aviso de memoria](https://github.com/websockets/ws/security/advisories/GHSA-58qx-3vcg-4xpx).

**Impacto y límite:** existe una versión afectada en el árbol de producción. No se demostró una ruta explotable: la aplicación usa el SDK para HCS y no expone un servidor WebSocket propio. Eso requiere un análisis de alcanzabilidad, no una declaración automática de explotación.

**Mejora:** resolvé la cadena mediante actualización compatible del proveedor o un override estrecho evaluado y probado. npm propone bajar el SDK a `2.81.0`; no apliques `audit fix --force` sin revisar compatibilidad. Verificá la resolución efectiva del lockfile y repetí pruebas HCS/API. Cerrá o documentá formalmente cada aviso con evidencia de alcance.

### AUD-04 · P1 · Referencias de error sin diagnóstico correlacionado

**Evidencia:** [apiBoundary](../src/server/http.ts#L54) crea contexto y convierte cualquier excepción en respuesta, pero no registra el fallo ni pasa ese contexto al callback. [ApplicationError](../src/server/application-error.ts#L8) no acepta `ErrorOptions`; [mapDatabaseError](../src/server/database/errors.ts#L27) reemplaza fallos descartando su causa. [Trabajo diferido](../src/server/hedera/service.ts#L19) sólo emite un código de texto sin contexto. HCS también transforma errores en códigos sin conservar una causa diagnóstica.

**Impacto:** la persona puede informar un `requestId` que no identifica ningún registro del fallo. Un 500 inesperado capturado por la aplicación puede quedar sin evidencia de su origen. La sanitización del contrato público es correcta y debe conservarse.

**Mejora:** propagá un contexto por solicitud a HTTP, SQL y trabajo diferido; conservá `cause` privadamente y emití un único evento estructurado para el fallo inesperado. Incorporá un logger con allowlist/redacción central, duración, ruta plantilla, código, versión y entorno. No publiques ni registres indiscriminadamente mensajes Prisma, parámetros, URLs de conexión o causas con PII. Los 4xx esperables no deberían clasificarse como ERROR.

**Aceptación:** inyectá un fallo de DB y otro de programación; desde la referencia pública se recupera una entrada segura con causa útil. Confirmá que no haya secretos ni duplicación de logs.

### AUD-05 · P2 · El perfil TypeScript pedido no compila

**Evidencia:** [tsconfig](../tsconfig.json#L10) activa `strict`, pero omite las otras dos opciones. La prueba real produjo 106 diagnósticos. Incluye opcionales pasados como `undefined` en UI/transporte, índices de arrays en parsing/CLI, `ApplicationError.fields` y resultados SQL de auditoría.

**Mejora:** corregí los modelos y estrechamientos por módulo y activá ambas opciones como gate. Diferenciá ausencia de propiedad de `undefined` cuando sea parte del contrato. Reemplazá la selección de rol por assertion en [OperationPanel](../src/components/operation-panel.tsx#L52) con parsing/narrowing. Concentrá y documentá los casts de adaptación JSON a Prisma, sin tratarlos como validación externa. Los `as const`, `satisfies` y casts justificados de infraestructura no son por sí mismos fallos.

**Aceptación:** cero diagnósticos con ambas opciones en código, scripts y tests; ninguna exclusión nueva para ocultarlos.

### AUD-06 · P2 · Política de seguridad del navegador incompleta en el repositorio

**Evidencia:** [next.config.ts](../next.config.ts) sólo declara `X-Robots-Tag` para la API; no hay CSP ni política de frame ancestors, nosniff o referrer en la configuración revisada. [S20](s20-validacion.md) reconoce la CSP pendiente. El script del tema es estático; el JSON-LD escapa `<`. No se encontró una inserción de HTML externo sin sanitizar en esas superficies.

**Mejora:** definí y verificá CSP compatible con el runtime instalado, `frame-ancestors`, `object-src`, `base-uri`, `form-action`, `X-Content-Type-Options`, `Referrer-Policy` y HSTS en el punto de terminación TLS. Ensayá CSP Report-Only y luego enforcement. Un hash del script de tema no basta para autorizar todos los scripts de Next. Evaluá una estrategia compatible con páginas estáticas; usar nonce por solicitud implica render dinámico según la guía instalada. No introduzcas `unsafe-inline` como arreglo general.

**Aceptación:** pruebas sobre HTTP del build y del candidato muestran las cabeceras, bloquean un frame no autorizado y mantienen tema, hidratación y QR. HSTS efectivo del hosting sigue siendo evidencia externa, no una ausencia demostrada de producción.

### AUD-07 · P2 · Contrato de errores y evolución HTTP incompletos

**Evidencia:** [catálogo](../src/shared/api-errors.ts) y boundary usan `{ error: { code, message, requestId } }` con `application/json`. Hay documentación Markdown, pero no contrato OpenAPI. Idempotencia y concurrencia se expresan con `requestId` y `expectedVersion` en el cuerpo, no con `Idempotency-Key`/`If-Match`. La representación pública tiene `version: 1`, sin una política completa de evolución de consumidores.

**Mejora:** especificá OpenAPI 3.2 para las superficies reales y su política de compatibilidad. Adoptá RFC 9457 si se mantiene el requisito solicitado: `application/problem+json`, miembros estándar y extensiones `code`/`traceId`. Adaptá también los tres transportes de frontend: hoy sólo reconocen `application/json`. Podés ofrecer headers estándar como adaptación al mecanismo durable existente. No corresponde afirmar que hoy faltan idempotencia o prevención de lost updates: ambas existen.

**Aceptación:** schemas de request/response y errores se verifican contra el contrato; los clientes aceptan Problem Details; replay idéntico conserva el resultado y cambio de intención da 409; una precondición HTTP, si se incorpora, da 412 sin escribir.

### AUD-08 · P2 · DoD sin lint ni puerta automática integral

**Evidencia:** [package.json](../package.json) no tiene `lint`; no se encontró CI versionado en `.github`. `build` genera Prisma y compila Next; no garantiza ejecutar suites. [Vitest](../vitest.config.ts) incluye sólo tests de API: CLI y UI tienen comandos separados. Los comentarios `eslint-disable` existentes no activan un linter.

**Mejora:** elegí un linter compatible con las versiones instaladas y creá un gate reproducible: tipos completos, lint, API, CLI y tokens; E2E/build según el cambio y un único runner para migraciones. Agregá tests rápidos de invariantes del dominio que reduzcan la dependencia de iniciar Next/PostgreSQL para cada feedback. No dupliques cada función con un test que sólo copie su implementación.

**Aceptación:** una violación real de tipos/lint o un test fallido bloquea la integración. Documentá cuáles suites se ejecutan en cada gate y evitá presentar `npm test` como todas las pruebas del repositorio.

### AUD-09 · P2 · Falta instrumentación operativa y un modelo de servicio medible

**Evidencia:** no hay inicialización propia OpenTelemetry, propagación instrumentada de contexto, endpoint/colector de métricas, sondas HTTP de salud ni SLO/error budget versionados en las superficies revisadas. [ops:status](../scripts/ops-status.ts) y los logs de mantenimiento ofrecen conteos útiles, pero son diagnósticos puntuales. El benchmark local S21 no es telemetría continua.

**Mejora:** instrumentá spans HTTP/SQL/upstream y vinculá el trabajo diferido con su solicitud o evento mediante contexto interno. Validá el contexto W3C entrante; no lo uses como autorización. Medí RED, espera/saturación del pool, atraso/edad de publicaciones y limpieza, y cuota HCS. Las etiquetas deben ser rutas plantilla, método, clase de status y códigos de catálogo: nunca traceId de negocio, UUID, email o URL arbitraria. Distinguí el `traceId` de negocio de Jopói del trace ID de OpenTelemetry.

Definí SLIs separados para persistir la acción y para publicar/contrastar en testnet; sus dependencias y presupuestos son distintos. Sumá owner, runbook y alertas de burn rate o atraso. Si el despliegue usa sondas, liveness no depende de SQL; readiness acota las dependencias críticas; startup sólo corresponde cuando el entorno lo necesita. Un fallo HCS no debería declarar muerta toda la aplicación.

**Aceptación:** una petición y su trabajo posterior son reconstruibles; hay histogramas p50/p95/p99 y alertas ensayadas, con cardinalidad y costos controlados. Los error boundaries muestran una referencia útil sin exponer el error privado.

### AUD-10 · P2 · Frescura, entrega de datos y semántica de páginas sin cerrar

**Evidencia:** [TracePage](../src/app/trazabilidad/[traceId]/page.tsx) valida sintaxis UUID y devuelve el shell; [TraceReader](../src/components/trace-reader.tsx#L18) consulta datos después de hidratar. Un UUID válido inexistente o vencido no determina el status del documento antes de entregar HTML. El `loading.tsx` global y los avisos de carga no reservan la geometría del contenido final. La vista permanece con el último dato hasta acción manual o expiración, sin presupuesto máximo de antigüedad.

**Mejora:** documentá los cinco ejes por ruta, incluidos el costo de Browser → API → SQL y el presupuesto de frescura. Para trazabilidad, evaluá lectura inicial server-side con el servicio compartido y un subárbol interactivo para contraste/QR; evitá hacer fetch HTTP a la propia API desde el servidor. Conservá admisión y límites al cambiar la entrada. Resolvé 404/410 antes del shell si se exige status HTTP real. Si se conserva el lector CSR por decisión de demo, explicitá esa semántica y medí su tiempo hasta datos útiles. Mostrá fecha de observación y condición de desactualización sin añadir polling contrario al presupuesto acordado.

**Aceptación:** evidencia sin JS y con red lenta por ruta; status y frescura acordados, sin flashes de geometría grandes ni duplicación de lecturas iniciales. Una vez enviado el shell no puede prometerse cambiar su status HTTP.

### AUD-11 · P2 · Core Web Vitals y presupuesto de JS sin evidencia de campo

**Evidencia:** [prueba de producción](../tests/seo/production.ts#L92) toma tres muestras Lighthouse de la landing y registra LCP/CLS/TBT; no aplica umbrales de regresión a esos valores. No se encontró integración RUM p75 ni presupuesto de JS por ruta. [S20](s20-validacion.md) informa históricamente LCP 0,94 s, CLS 0, TBT 235 ms y deja INP de campo pendiente; esta auditoría no reprodujo esas cifras.

**Mejora:** fijá gates de laboratorio reproducibles y medí p75 RUM de LCP, INP y CLS por ruta plantilla y clase de dispositivo con minimización de datos. Revisá el JS de Zod, schemas del escenario y panel operativo antes de introducir más code splitting; `qrcode` ya se carga dinámicamente. No cargues librerías de validación adicionales sin necesidad.

**Aceptación:** p75 de campo LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1, con ventana y volumen mínimo de muestra explícitos; JS comprimido por ruta dentro de un presupuesto acordado. TBT y capturas no acreditan INP.

### AUD-12 · P2 · El pool está limitado por instancia; falta acreditar capacidad global

**Evidencia:** [cliente](../src/server/database/client.ts#L9) fija `max: 2`; singleton correcto en [database/index](../src/server/database/index.ts#L9). La documentación distingue el límite local del global y propone conexión pooled/directa. No hay en esta revisión evidencia del límite real del proveedor, cantidad máxima de instancias, reparto de conexiones ni latencia regional desplegada.

**Mejora:** registrá el cálculo `instancias concurrentes × 2 + conexiones operativas/reserva` para clientes y la capacidad del pooler hacia PostgreSQL, distinguiendo ambos niveles. Medí espera y rechazos; verificá región de funciones cerca de la DB. Mantené timeout y rechazo acotado cuando se sature. No aumentes el pool por intuición.

**Aceptación:** carga sobre build/candidato con límites de proveedor conocidos; latencia p95/p99, errores, espera y conexiones dentro del presupuesto. Las mediciones actuales sobre Next dev no acreditan ese resultado.

### AUD-13 · P2 · Cookie sin prefijo de host; ciclo de sesión limitado a vencimiento absoluto

**Evidencia:** [credenciales](../src/server/sessions/credentials.ts#L6) usa `jopoi_session`; hay 256 bits aleatorios, hash HMAC, HttpOnly, SameSite=Lax, Secure en producción y Path=/ sin Domain. La sesión tiene vencimiento absoluto de 24 h, sin idle timeout ni operación de revocación/logout. Origin exacto, JSON y header custom protegen mutaciones; no hay token sincronizador ni control Sec-Fetch.

**Mejora:** usá `__Host-` en HTTPS con una migración explícita y nombre local de desarrollo si hace falta. Para la demo anónima documentá si se acepta el vencimiento absoluto como única política; antes de incorporar usuarios/permisos reales, sumá revocación, idle timeout y rotación al cambiar privilegios. Si el requisito literal de CSRF exige token sincronizador, agregalo junto con la política Fetch Metadata y sus pruebas. La defensa actual de Origin y headers es relevante: la ausencia de token no demuestra un bypass CSRF.

**Aceptación:** cookie real sobre HTTPS con prefijo y atributos; rechazo de origen cruzado y de headers faltantes; migración sin adoptar una sesión ambigua. No se demostró explotación de cookie tossing; el prefijo es hardening.

### AUD-14 · P2 · Estados inválidos todavía representables en el núcleo

**Evidencia:** [OperationData](../src/shared/operation-contracts.ts#L16) permite cualquier combinación de state con campos nullable. [operationDataSchema](../src/domain/event-schemas.ts#L24) valida tipos individuales sin relacionarlos por estado. Por ejemplo, `RECEIVED` con `receivedKg: null` supera esa forma. Las decisiones de dominio y los schemas de eventos aplican comprobaciones adicionales, por lo que no se afirma que una request HTTP normal pueda generar ese estado.

**Mejora:** modelá borrador/publicado, asignado/retirado y estados terminales con uniones discriminadas, o centralizá primero una validación semántica completa del estado operativo. Alineá las invariantes críticas con constraints SQL mediante migraciones nuevas cuando corresponda. Evitá repartir la misma regla en múltiples schemas diferentes.

**Aceptación:** los estados inválidos no compilan y/o se rechazan al reconstruir desde SQL, incluyendo estados terminales; las transiciones, recibos históricos y eventos válidos siguen siendo compatibles.

### AUD-15 · P3 · Proyecciones SQL más amplias que la necesidad

**Evidencia:** [replay de comando](../src/server/operations/commands.ts#L58) usa `publication: true`, cargando bytes firmados e historial que la respuesta no expone; la selección de publicaciones del coordinador incluye el run completo. Las lecturas públicas sí usan proyección mínima. [queries privadas](../src/server/operations/queries.ts#L32) hacen `rows.map` con `rows.find` interno.

**Mejora:** reutilizá selects mínimos en las rutas calientes y en replay. El cálculo cuadrático de bloqueos puede hacerse en una pasada si el historial crece. Hoy el recorrido normal tiene como máximo cinco hitos: ese O(n²) no justifica una refactorización urgente. En exportación por cursor, evaluá índice `(createdAt, id)` sólo con EXPLAIN y volumen representativo; no lo agregues a ciegas.

**Aceptación:** menos bytes/objetos consultados, misma salida y una mejora medida donde importe; no exponer modelos ORM ni añadir repositorios passthrough.

### AUD-16 · P3 · Legibilidad y documentación técnica inconsistentes

**Evidencia:** comentarios técnicos en inglés en coordinador, provider, hooks, tests y configuración; múltiples operaciones por línea y ternarios encadenados en reintento/panel. Las interfaces y el texto del producto son mayormente claros y usan español local.

**Mejora:** redactá comentarios de invariantes, causas y trade-offs en español rioplatense. Actualizá referencias históricas Sxx cuando hagan difícil entender la intención vigente. Separá expresiones que mezclan varias decisiones y extraé predicados con significado de negocio. Conservá switches discriminados cuando faciliten narrowing: sustituirlos mecánicamente por dispatch maps puede empeorar tipos y lectura.

### AUD-17 · P2 · Resiliencia temporal parcial a nivel conjunto

**Evidencia:** mirror limita tiempo (3 s), bytes y redirects; SDK y SQL tienen timeout. El coordinador usa deadlines, leases y fechas de elegibilidad fijas de 1/5/15 minutos, sin jitter. La secuencia de HCS respeta predecesores y reconcilia identidades inciertas. No hay límite global instrumentado de llamadas preparatorias, single-flight de verificaciones ni breaker compartido; cuotas de envío y rate limits no son límites de concurrencia simultánea. [readJsonBody](../src/server/http.ts#L23) acota bytes pero no tiempo de lectura propio.

**Mejora:** documentá el presupuesto total de solicitud y dependencia, incluyendo espera de pool y lectura de cuerpo. Propagá cancelación cuando corresponda. Agregá jitter a elegibilidad si se observa sincronización y un bulkhead o rechazo temprano antes de preparaciones HCS costosas cuando no haya capacidad. Evaluá un breaker sólo ante fallas y volumen que lo justifiquen; no una librería obligatoria. Para cron, bearer y lease son la autenticación/serialización disponibles: no es un webhook firmado por terceros.

**Aceptación:** dependencia lenta/caída, cuerpo lento y múltiples solicitudes no consumen capacidad sin límite; la recuperación conserva el mismo ID incierto y no duplica envíos. Los cambios de resiliencia nunca deben convertir incertidumbre en reintento ciego.

## Matriz punto por punto

### 1. SKL-JSTS-PRO-001

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| Tres flags estrictos y compilación | F | `strict` sí; los dos adicionales producen 106 diagnósticos. AUD-05. |
| `any`, `unknown`, narrowing y assertions | P | No se encontraron declaraciones `any` explícitas en código propio de `src`; respuestas y cuerpos usan `unknown`/Zod. Hay casts de rol y adaptación JSON por revisar. `AbortSignal.any` no es el tipo `any`. |
| `readonly` y tipos semánticos | P | Contratos mayormente readonly, estados/roles cerrados y dinero decimal exacto. Strings de cantidad/identidad no siempre distinguen semántica por tipo. |
| Uniones discriminadas e invariantes | P | Comandos, resultados y outcomes bien modelados; `OperationData` y `Intent` del hook mantienen combinaciones inválidas posibles. AUD-14. |
| Body, params, headers y env | C/P | Zod estricto, UUID normalizado, body 4/16 KiB, Origin/MIME/cookie/cron verificados y config por capacidades. Falta límite temporal propio del body; query de filtros no existe. |
| DB JSON y API externa | C/P | Snapshot, payload y evidencia se parsean; mirror tiene schemas y límites. Assertions SQL genéricas no validan una fila arbitraria: se apoyan en consultas/esquema controlados. |
| Functional Core / Imperative Shell | C | `domain` sin red/ORM; efectos en `server`; proveedor y reloj inyectables en coordinación. |
| Guard clauses, SOLID, DRY, KISS, YAGNI | C/P | Predomina flujo temprano y módulos por responsabilidad. Hay complejidad localizada en coordinación/hook; no hace falta arquitectura empresarial nueva. AUD-16. |
| Independencia async y loops | C | No se observó una waterfall de I/O independiente significativa en handlers. Las operaciones de una transacción comparten conexión; paralelizarlas con Promise.all no implica paralelismo SQL útil. HCS debe preservar orden. |
| Concurrencia acotada | P | Trabajador por lotes y lease por evento; falta presupuesto integral de admisión/concurrencia. AUD-01/17. |
| Streams y backpressure | C | Cuerpo/mirror incrementales y acotados; CSV por páginas de 500 con escritura esperada. No hace falta pipeline por ritual si la memoria ya está acotada. |
| CPU, event loop y memoria | C/P | No se identificó CPU pesada que amerite workers. Cuerpo/JSON pequeños, BigInt acotado operativamente y QR lazy. Crecimiento durable de recibos/retención sí requiere acción. |
| Complejidad algorítmica | C/P | O(n²) de bloqueos con n≤5 normal; prioridad baja. Evitá tratarlo como cuello de botella medido. |
| Errores con causa, logging, secretos | P/F | Contrato seguro; causa y contexto operacional insuficientes. AUD-04. |
| Comentarios rioplatenses que explican porqué | P | Mezcla inglés/español; varios comentarios sí explican invariantes. AUD-16. |
| DoD tipos/lint/tests | P/F | Tipos actuales y pruebas parciales pasan; perfil requerido y lint no. AUD-05/08. |

### 2. SKL-FE-ARCH-002

Los modos siguientes se deducen del código; no sustituyen la salida de un build nuevo ni la configuración real de la CDN.

| Ruta/subárbol | Lugar | Momento | Frescura observada | Entrega | Interactividad |
| --- | --- | --- | --- | --- | --- |
| `/`: contenido del escenario | Build/Origin, apto para CDN | Prerender elegible | Ligada al build del escenario; falta presupuesto formal | HTML/RSC de contenido ya disponible | RSC para contenido; componentes cliente para formulario/consulta/tema |
| `/demo`: shell | Build/Origin, apto para CDN | Prerender elegible | Copy/configuración ligados al build | HTML de explicación y estado inicial | Panel React hidratado |
| `/demo`: sesión/operación | Browser → API Node → DB | Mount, acciones y actualización explícita | Última lectura; invalidación por conflicto/expiración, sin edad máxima declarada | JSON posterior al JS | Cliente con validación de respuesta y cancelación |
| `/trazabilidad/[traceId]`: shell | Origin para ruta dinámica no enumerada | Request; espera params | UUID validado; no conoce existencia del recurso | Shell susceptible de streaming por boundary global | Lector cliente |
| Historial público | Browser → API Node → DB | Después de hidratación y refresh manual | Última lectura hasta vencimiento de 7 días; sin SLA de frescura | JSON; no SSR de datos | Cliente |
| Contraste por evento | Browser → API Node → mirror | Acción explícita | Observación puntual con timestamp | JSON bajo demanda | Cliente; una solicitud a la vez por vista |
| QR | Browser | Después de datos y lazy import | Enlace ligado a expiración | Imagen PNG de 256×256 | Módulo `qrcode` diferido |

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| Cinco ejes y estrategia híbrida | P | Elección estático + cliente razonable para demo; faltan budgets explícitos y evaluación de datos iniciales. AUD-10. |
| SSG/ISR/SSR/CSR según volatilidad/SEO | C/P | Landing puede ser estática; demo no necesita SEO personalizado; trazabilidad es noindex. No hay fuente volátil que justifique añadir ISR/webhooks. CSR público añade dependencia de JS. |
| Streaming/Suspense y status | P | Un `loading.tsx` global, sin micro-boundaries; datos principales se obtienen en useEffect. No se acredita streaming de datos por tener loading. AUD-10. |
| Skeletons/CLS | P/E | Foto importada con dimensiones, QR/placeholder dimensionados; avisos de carga genéricos no reproducen geometría final. Falta medición actual de las tres rutas. |
| Hidratación | C/E | Estado inicial de lectores es estable. Date.now se usa sobre datos que llegan después del mount; no prueba un mismatch por sí solo. `suppressHydrationWarning` está limitado a html por el tema, no masivamente. Falta corrida de navegador nueva. |
| Serialización y privacidad | C | Props públicas de origen/UUID; no se encontró token/clave serializado en estas rutas. Tema en localStorage es una preferencia, no una credencial. |
| LCP y ruta crítica | C/E | `next/image` con preload y sizes, fuente local next/font. Evidencia Lighthouse histórica, no p75 real. AUD-11. |
| INP y JS | P/E | QR lazy, sin scripts comerciales externos en el inventario; falta presupuesto/análisis de bundle y RUM. |
| CLS y fuentes | C/P/E | Geometría de foto/QR y ajuste de fuente de next/font; fallback y cargas de vistas necesitan evidencia en dispositivos. |
| Edge/data locality | C/E | Runtime Node coherente con pg/SDK; no se fuerza Edge. Región real DB/función pendiente. AUD-12. |
| Caché pública y privada | C | Privados `private, no-store` + Vary Cookie; cron Vary Authorization; API pública no-store. No se encontró cache compartida que mezcle sesiones. |

### 3. SKL-API-NODE-NEXT-001

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| Route Handlers vs Node dedicado | C | BFF y APIs pequeñas coherentes; trabajo durable en SQL + after/cron. No hay WebSocket intensivo ni necesidad actual de servicio separado. |
| REST y recursos | P | Sustantivos predominantes; `/reset` y `/retry` son comandos explícitos. No son por sí solos fallos funcionales; documentá la excepción y no cambies URLs sólo por estética. |
| Métodos seguros | C/Excepción | GET de lectura no publica eventos ni cambia dominio. Rate buckets son efectos técnicos de admisión. GET cron sí muta por integración Vercel, autenticado y no-store; excepción administrativa documentada. |
| Status y JSON | C/P | 201 creación, 202 reintento diferido, 400/401/403/404/409/410/422/429/503 coherentes; `saved:true` refiere a SQL, no confirma HCS. No se detectó un 200 con fallo HTTP disfrazado. 201 podría añadir Location. |
| Fechas y dinero | C | ISO UTC, cantidades e importes decimales exactos y moneda explícita; no floating point monetario ingenuo. |
| OpenAPI y evolución | F/P | Markdown útil, sin OpenAPI ni política completa de versión/deprecación pública. AUD-07. |
| Paginación y allowlists | C/NA | No hay endpoint de listado arbitrario; historial normal de ≤5 hitos. CSV usa cursor y take=500. Filtros/orden aportados por usuario no existen. No agregar paginación vacía por ceremonia. |
| Idempotencia | C/P | UUID + hash + recibo/resultados + constraints; 409 al cambiar intención. Falta header solicitado, no el mecanismo. AUD-07. |
| Concurrencia optimista | C/P | `expectedVersion` y actualización condicional/serializable; falta adaptación If-Match/412 si se exige interoperabilidad HTTP. |
| Cachés L0–L4 | C/NA | No hay caché runtime L1 de datos que crezca; Map de mensajes es estático. Ausencia de Redis/use cache no es un defecto cuando se necesita no-store. |
| ETag/304 y stampede | NA/P | No se implementan validadores HTTP; no se identificó caché que expire masivamente. Coalescer verificaciones públicas puede evaluarse por carga, con evidencia etiquetada por instante. |
| Timeouts/cancelación | C/P | SQL, mirror, cliente y SDK acotados; deadline global y body aún parciales. AUD-17. |
| Retries y duplicados | C/P | Conservación de ID incierto, 3+1 intentos y pausas; sin jitter/breaker/bulkhead global. No se recomienda retry genérico de escrituras. |
| Jobs, cron y webhooks | C/P/NA | Outbox en SQL, after best effort y lease/fencing en cron. No hay webhook externo que requiera firma/timestamp. Falta garantía operacional de servicio del backlog. AUD-02. |
| Rate limit y load shedding | P | Durable y fail-closed donde se invoca, pero cobertura parcial y contador global disputado por scope. AUD-01/12/17. |

La guía instalada confirma que los Route Handlers no se cachean por defecto y distingue Cache Components habilitado. Este proyecto no lo habilita. No corresponde añadir `use cache`/`cacheTag` indiscriminadamente a datos privados o a controles de vigencia.

### 4. SKL-ARCH-PRISMA-001

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| Major y adapter | C | Prisma 7.10.1 con PrismaPg 7.10.1 y cliente generado ESM. |
| Singleton/warm instance/disconnect | C | Cliente lazy reutilizado; global de desarrollo para HMR. Disconnect de CLI en finally, no en cada request. |
| Pool a nivel sistema | P/E | Dos conexiones por cliente, timeouts explícitos; dimensión global/pooler/egress/región pendientes. AUD-12. |
| Frontera ORM y DTOs | C | Imports Prisma en infraestructura/servicios de servidor; contratos públicos propios y construcción explícita. No hay repositorios ceremoniales. |
| Schema y nullability | C/P | PascalCase singular, camelCase, UUID, enum, timestamptz, unique/FK compuestas y CHECKs SQL. Nullability del estado operativo mejorable. AUD-14. |
| Acciones referenciales y N:M | C/NA | Restrict en sesión y cascadas de retención justificadas. No existe relación N:M con metadata que exija otra tabla. |
| Índices por query | C/P | Unique sesión+ordinal y run+ordinal, vencimientos y elegibilidad. No se propone indexar todo; planes reales del candidato pendientes. |
| Proyección, includes, N+1 | C/P | Públicas con select mínimo; lecturas del historial sin N+1 de red/SQL. Includes de replay cargan campos innecesarios. AUD-15. |
| Bulk y lotes | C/P | Limpieza deleteMany/updateMany y exportación por cursor; límites de padres no acotan cascadas. AUD-02. |
| SQL parametrizado/TypedSQL | C | Tagged templates Prisma.sql/joins parametrizados; no se encontraron rawUnsafe en src propio. TypedSQL no es obligatorio para estas consultas. |
| Transacciones cortas y red fuera | C | 5 s SQL y 2 s espera; proveedor externo fuera de callbacks SQL. No paralelizar queries de una misma transacción por ritual. |
| Transactional Outbox | C | Estado/recibo/evento/publicación pendiente en misma transacción; activación after posterior. HcsPublication cumple el rol de salida durable sin otra tabla duplicada. |
| Migrate deploy y runner | C/P | CLI ejecuta migrate deploy con conexión administrativa explícita; build no migra. Falta garantizar runner único y gate de CI en el repositorio. |
| Expand/backfill/switch/contract | P | Última migración es aditiva. Migración histórica de coordinación hace backfill INSERT SELECT/UPDATE dentro de BEGIN, sin lotes; no acredita zero-downtime para una tabla grande. No editarla si ya fue aplicada: diseñá migraciones futuras y ensayos con lock_timeout/volumen. |
| Inmutabilidad, seeds y recuperación | C/E/NA | Triggers protegen evidencia; migraciones versionadas. Fixtures de tests no son seeds de producción. Permisos/TLS y restore remotos pendientes; historial S21 no los acredita. |

### 5. SKL-WEB-SEC-001

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| Deny by default y sesión | C | Hash válido + sesión vigente; comandos sin sesión no crean una implícita. Errores de configuración/DB no habilitan acceso. |
| Autorización por recurso/BOLA | C | `requireOwnedRun` filtra traceId+sessionId+vigencia dentro de transacción; reintento vincula evento al run. ID público no autoriza mutaciones. |
| Roles y tenancy | C/NA | Roles deliberadamente simulados por un visitante; no representan autenticación empresarial. No hay tenants reales. Antes de introducirlos deberán existir filtros/identidad/roles reales. |
| Passwords, recuperación, MFA, OAuth y JWT | NA | No hay cuentas, contraseñas, recuperación, OAuth ni JWT. Agregarlos para cumplir una checklist ampliaría el producto sin necesidad. |
| Entropía y almacenamiento de sesión | C | randomBytes(32), HMAC en DB, sin token en DTOs o browser storage. |
| Cookies | P | HttpOnly/Secure/Lax/Path correctos en producción; falta __Host-. AUD-13. |
| Timeout, logout y rotación | P/NA | Absolute 24 h; idle/revocación no implementados. Login/cambio de privilegio no existen. Tratá el ciclo completo antes de auth real. |
| CSRF | C/P | Origin configurado exacto, JSON y header custom, sin CORS permisivo encontrado. No token sincronizador/Sec-Fetch del requisito literal. No se confirmó bypass. AUD-13. |
| Mass assignment | C | Schemas estrictos; contacto normalizado y mapeo de comandos controlado. Spread de un DTO validado no equivale a aceptar req.body directamente. |
| Caché sensible y permisos | C/NA | No-store privado; no caché de permisos actual que requiera permissionVersion. |
| XSS/CSP/clickjacking | C/P | React codifica texto, JSON-LD escapa `<`, bootstrap constante. CSP y frame policy sin definir. AUD-06. |
| SQLi/Command Injection | C | SQL parametrizado; CLI spawn shell:false y argumentos controlados. No se encontró concatenación de input HTTP a SQL/comandos. |
| SSRF y uploads | C/NA | Mirror fijo y sin redirects; no fetch de URL arbitraria ni uploads. No se requiere inventar un subsistema de archivos. |
| TLS, CORS y headers | P/E | TLS SQL remoto verifica certificado; HTTPS de la aplicación y cabeceras del hosting pendientes. API del mismo origen sin Access-Control-Allow-Origin abierto. |
| Secretos, PII y dependencias | C/P | Config privada y contactos separados de HCS; no se halló secreto literal en los archivos fuente inspeccionados. No se escaneó todo el historial Git. Avisos npm pendientes de remediación. AUD-03. |

El control Origin/custom-header encaja con defensas documentadas por [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). La especificación del pedido exige controles adicionales; se marca cumplimiento parcial sin confundirlo con una vulnerabilidad demostrada. No se afirma conformidad completa [ASVS 5.0](https://asvs.owasp.org/).

### 6. SKL-ARCH-OBS-001

| Punto solicitado | Estado | Evaluación |
| --- | --- | --- |
| OTel + W3C end-to-end | F/E | Sin integración propia revisada ni evidencia de trazas del proveedor. El contexto de negocio no sustituye un span. AUD-09. |
| JSON y campos base de logging | P/F | Mantenimiento emite JSON por console.info con conteos y duración; callbacks de pool/background emiten texto por console.error. Sin schema común/version/environment/correlation. AUD-04/09. |
| Niveles y 4xx esperables | P | No hay logs masivos de 4xx como ERROR; tampoco política central de severidad. No registrar no satisface observabilidad. |
| Redacción central | P/F | Allowlist local de mantenimiento y errores públicos seguros; falta una política única para el pipeline de logs/traces/métricas. |
| Taxonomía/códigos estables | C/P | Catálogo de API y códigos HCS, resultados de dominio y errores DB clasificados; clasificación operacional/cause incompletas. |
| Causa/catches | F/P | Transformaciones pierden causa. Capturas de clipboard/tema/JSON que devuelven un estado explícito no son necesariamente errores ocultos. AUD-04. |
| Boundary global y RFC 9457 | P/F | Boundary compartido y sanitizado; contrato no es Problem Details y no tiene trace ID de telemetría. AUD-07. |
| Páginas 404/403/429/500/503 | P | not-found, error y global-error presentes; errores API muestran mensajes/referencias y 429 Retry-After. Error boundaries ignoran digest y no aportan referencia; 503 no define Retry-After. Status del documento público no depende de existencia. |
| RED/USE/saturación/negocio | F/P | Hay reportes puntuales y benchmark p50/p95 local, no histogramas operativos continuos/p99. AUD-09. |
| Cardinalidad | NA/P | No existe pipeline propio que abuse de labels; falta diseñar allowlist antes de incorporarlo. No etiquetar con UUID ni traceId de negocio. |
| Live/ready/startup | F/NA | No implementadas; diseñar según plataforma. Startup no es automáticamente necesario en serverless. |
| SLIs/SLOs/error budgets | F | Sin objetivos de disponibilidad, latencia ni tiempo de publicación/limpieza operativamente medibles. |
| Alertas/owner/runbooks | P/F | Documentación de operación/recuperación y CLI útiles; faltan alertas automáticas accionables y owner explícito. |

## Definition of Done consolidada

| Especificación | Dictamen | Condición pendiente más importante |
| --- | --- | --- |
| JSTS | Parcial; DoD no satisfecho | Perfil estricto completo, lint y causas/observabilidad. |
| Rendering | Parcial; DoD sin evidencia suficiente | Frescura/entrega por ruta, budgets y p75 RUM. |
| API Node/Next | Parcial; DoD no satisfecho | Admisión integral, contrato estándar y capacidad de recuperación. |
| Prisma | Base sólida; DoD operativo parcial | Capacidad global, limpieza sostenible y evidencia del proveedor/rollout. |
| Web Security | Controles importantes presentes; DoD parcial | Dependencias, headers/CSP y hardening/ciclo de sesión aplicable. |
| Observabilidad | DoD no satisfecho | Diagnóstico correlacionado, métricas, SLOs y alertas. |

Las brechas compartidas se cuentan una sola vez como hallazgos, aunque afecten varios DoD. No se asigna un porcentaje de cumplimiento porque los controles tienen pesos y aplicabilidad diferentes.

## Orden de mejora propuesto

1. **Cerrar exposición y crecimiento:** AUD-01/02/03. Límites coherentes con capacidad/retención, ensayo multijornada y resolución de la dependencia afectada. Reutilizá PostgreSQL y el ingreso existentes; respetá presupuesto cero.
2. **Hacer investigable y verificable el sistema:** AUD-04/05/08. Contexto seguro y causas, cero diagnósticos con flags completos, lint y gates reproducibles.
3. **Completar contrato y navegador:** AUD-06/07/13/14. CSP probada, Problem Details/OpenAPI con adaptación de clientes, cookie/ciclo de sesión justificados y estados semánticos consistentes.
4. **Medir para evolucionar:** AUD-09/10/11/12/17. Instrumentación proporcional, budgets, carga sobre build/candidato, RUM y servicio de backlog. Luego decidir si hace falta cambiar dónde se renderizan datos o separar ejecución.
5. **Pulir después de medir:** AUD-15/16. Selects mínimos, documentación local y simplificación focalizada. Workers, Redis, circuit breakers o una API dedicada necesitan evidencia de una necesidad concreta.

## Referencias de interpretación

- El formato estándar propuesto de errores se contrasta con [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html). `code` y `traceId` son extensiones del contrato solicitado; no campos universales obligatorios del RFC.
- La necesidad de medir Core Web Vitals en campo y por percentiles se contrasta con [Web Vitals](https://web.dev/articles/vitals). Los resultados de laboratorio existentes no acreditan el p75 solicitado.
- La configuración del pool de Prisma 7 depende del driver adapter: [documentación Prisma v7](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool). El cálculo global es una tarea de capacidad del despliegue.
- La propagación distribuida se contrasta con [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/propagation/). La elección y costos del exportador quedan sujetos al entorno real.
- Las guías locales consultadas están en `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `02-guides/streaming.md` y `02-guides/content-security-policy.md`. Son la referencia de la versión instalada, por encima de recetas antiguas.

La auditoría agrega este informe; no aplica correcciones funcionales, modifica migraciones, actualiza dependencias, despliega ni envía mensajes a Hedera. La suite API usa PostgreSQL descartable y el proveedor HCS controlado del arnés.
