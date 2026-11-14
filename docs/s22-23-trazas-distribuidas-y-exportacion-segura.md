# S22-23 · Seguir una acción desde HTTP hasta SQL, HCS y cron (`D05`, `D13`, `D18`, `AUD-04`, `AUD-09`)

## Trazabilidad y objetivos

- **Spec S22:** historias 24, 25, 26, 27, 28, 61, 66, 67, 68, 83 y 86; decisiones `D05`, `D13` y `D18`; hallazgos de auditoría `AUD-04` y `AUD-09`; escenarios `S22-08`, `S22-09`, `S22-26` y `S22-29`.
- **Objetivo:** Reconstruir el recorrido técnico completo de una acción, desde la solicitud HTTP pública hasta las operaciones SQL, el trabajo diferido inmediato en `after()`, la publicación en HCS y la reconciliación o drenaje diferido en `cron`. Se implementa con contexto distribuido W3C validado y límites estrictos, outbox con contexto mínimo aditivo entre días, relaciones honestas en cron (mediante span links sin fingir paternidad de solicitudes terminadas ni fabricar trazas falsas en recuperaciones históricas), y un exportador de telemetría a stderr acotado a presupuesto cero que no bloquea la operación ni crea buffers ilimitados ante backpressure.

---

## 1. Contexto W3C y Frontera de Confianza (`D05`, `D13`, `AUD-04`)

En [`src/server/diagnostics.ts`](../src/server/diagnostics.ts):

1. **Parsers estrictos W3C:**
   - `parseTraceparent`: Valida el formato canónico `version-traceId-parentId-flags` (55 caracteres para versión `00`). Rechaza versiones reservadas (`ff`), identificadores nulos o todo ceros (`00000000000000000000000000000000` o `0000000000000000`), caracteres no hexadecimales y separadores malformados.
   - `parseTracestate`: Valida listas de pares `key=value` con un límite estricto de 512 bytes y hasta 32 entradas.
   - `parseBaggage`: Parsea atributos clave-valor respetando límites de tamaño (máximo 4096 bytes y 64 items).
2. **Frontera de confianza (`trustW3c`):**
   - Las solicitudes HTTP de visitantes son tratadas como no confiables (`trustW3c: false` por defecto en `apiBoundary`).
   - Un `traceparent` externo no confiable **nunca sobreescribe el identificador técnico local** (`telemetryTraceId`) ni impone un span padre falso en el span raíz HTTP (`parentSpanId: null`).
   - Cuando el visitante proporciona un `traceparent` válido, éste se registra honestamente como un vínculo entrante (`links: [{ traceId, spanId }]`), preservando la referencia sin ceder control de la traza.
   - Si una llamada proviene de un origen con confianza explícita (`trustW3c: true`), se preserva el `traceId` y se adopta el `parentId` como `parentSpanId`.
3. **Aislamiento de baggage:**
   - Conforme a la regla de diseño `D05` y el criterio de aceptación 1, el baggage externo es completamente desacoplado: **no puede fijar ni alterar la identidad del usuario, los roles de simulación, el `businessTraceId` ni etiquetas de diagnóstico**, previniendo escalamiento de privilegios o explosión de cardinalidad de métricas.

---

## 2. Persistencia de Contexto Mínimo en Outbox (`D13`, `D18`, `AUD-09`, `S22-29`)

En [`prisma/schema.prisma`](../prisma/schema.prisma) y [`src/server/operations/commands.ts`](../src/server/operations/commands.ts):

1. **Evolución aditiva de esquema (`202611060002_publication_telemetry_context`):**
   - Se agregaron a la tabla `HcsPublication` las columnas:
     - `telemetryTraceId VARCHAR(32)`: Identificador de 32 caracteres hexadecimales de la traza técnica del comando que encoló el hito.
     - `telemetrySpanId VARCHAR(16)`: Identificador de 16 caracteres hexadecimales del span que ejecutó la mutación.
   - Ambas columnas son opcionales (`NULL`), garantizando despliegue no bloqueante y coexistencia sin requerir bloqueos de tabla.
2. **Minimización de datos en reposo:**
   - La outbox almacena **exclusivamente** el contexto técnico mínimo necesario para correlacionar la publicación entre días.
   - No se almacenan cookies, tokens de sesión, credenciales, cabeceras libres ni información personal (PII).
3. **Aislamiento en proyecciones públicas:**
   - En [`src/server/traces/projection.ts`](../src/server/traces/projection.ts), las proyecciones públicas `publicTracePublicationSelect` y `publicVerificationPublicationSelect` excluyen explícitamente `telemetryTraceId` y `telemetrySpanId`, impidiendo cualquier filtración de identificadores internos a clientes públicos.

---

## 3. Relaciones Honestas en Cron y Recuperación Histórica (`D13`, `D18`, `AUD-09`, `S22-09`)

En [`src/server/hedera/coordinator.ts`](../src/server/hedera/coordinator.ts) y [`src/server/hedera/service.ts`](../src/server/hedera/service.ts):

1. **Trabajo diferido inmediato (`schedulePublications`):**
   - Cuando la publicación se drena inmediatamente dentro del ciclo de vida de la solicitud mediante `after()`, el coordinador ejecuta con `childContext(parent, "publications.drain")`.
   - Mantiene la jerarquía directa: `traceId === parent.telemetryTraceId` y `parentSpanId === parent.spanId`.
2. **Drenaje y mantenimiento en cron (`maintenance.run`):**
   - El cron diario (`GET /api/cron`) crea su **propia raíz técnica independiente** (`parentSpanId: null`, nuevo `requestId` y nuevo `telemetryTraceId`), evitando fingir una relación padre-hijo con una solicitud HTTP que finalizó horas o días atrás.
3. **Vinculación honesta vía Span Links:**
   - Al procesar una publicación que posee contexto persistido en la outbox (`row.telemetryTraceId` y `row.telemetrySpanId`), el procesamiento se ejecuta bajo un contexto vinculado:
     ```typescript
     links: [{ traceId: row.telemetryTraceId, spanId: row.telemetrySpanId }]
     ```
   - Si la publicación ocurre o falla durante el cron (e.g. `publication.recovered`), el diagnóstico exportado incluye los `links` apuntando inequívocamente a la acción original.
4. **Recuperación histórica sin fabricación de trazas:**
   - Para filas históricas creadas antes de la migración (donde `telemetryTraceId` es `NULL`), el sistema las procesa normalmente **sin inventar identificadores de traza falsos ni enlaces sintéticos** (`links` omitido), respetando la veracidad histórica de los datos.

---

## 4. Exportación Segura, Redacción y Presupuesto Cero (`D05`, `D13`, `AUD-04`, `S22-26`)

En [`src/server/diagnostics.ts`](../src/server/diagnostics.ts):

1. **Canal único y formato estricto:**
   - La telemetría se emite como líneas JSON individuales a `process.stderr`.
   - Cada línea incluye timestamp UTC ISO, `severity`, `service.name: "jopoi"`, `service.version`, `environment`, `event.name`, `requestId`, `traceId`, `spanId`, `parentSpanId`, `businessTraceId`, `links` (cuando existan), `operation`, `method`, `route` (catálogo cerrado), `code`, `outcome`, `durationMs`, contadores permitidos y causa saneada.
2. **Redacción centralizada:**
   - `safeErrorChain` extrae exclusivamente el tipo de error, código permitido y hasta 4 marcos de archivos de código propio.
   - Se redactan antes de exportar: URLs completas de conexión PostgreSQL, contraseñas, tokens de sesión y CSRF, cookies, cabeceras de autorización, emails de contactos y bytes binarios de transacciones (`signedTransactionBytes`).
3. **Control de tamaño y backpressure sin buffers infinitos:**
   - Límite duro de tamaño: líneas mayores a 8192 bytes son descartadas y computadas en el contador interno de descartes (`droppedDiagnostics`).
   - Manejo de backpressure: si `output.write()` devuelve `false` o el flujo de salida está destruido/cerrado, las emisiones subsiguientes se descartan inmediatamente en lugar de acumular buffers en memoria hasta agotar el heap. La bandera `blocked` se rehabilita de forma asíncrona mediante el evento `drain`.
   - Muestreo sostenible: errores 5xx y solicitudes exitosas 2xx se registran al 100%; solicitudes 4xx esperables se muestrean al 1/16 (mediante la última cifra del `requestId`).

---

## 5. Evidencia y Verificación Local

1. **Contratos y validación de límites (`tests/contracts/boundary.test.ts`):**
   - 28 pruebas unitarias y de integración que verifican la validación estricta de `parseTraceparent` (formatos válidos, banderas, versiones `ff` y ceros rechazados), límites de `parseTracestate` (512 bytes) y `parseBaggage` (4096 bytes y 64 items), la frontera de confianza de `createRequestContext` y la exclusión de columnas de telemetría de outbox en las proyecciones públicas.
2. **Observabilidad y exportador real (`tests/observability/diagnostics.test.ts`):**
   - 6 pruebas que validan el comportamiento del exportador a stderr: 24 contextos asíncronos concurrentes con 72 registros, límites de tamaño a 8 KiB con descarte medido, serialización condicional de `links` e integridad funcional ante el cierre abrupto del pipe stderr.
3. **Integración HTTP y ciclo de vida de outbox (`tests/api/diagnosticos.test.ts`):**
   - 4 escenarios HTTP completos:
     - `S22-08`: Errores SQL y fallos de infraestructura investigables con referencias seguras y causas saneadas sin exponer credenciales ni stack privado.
     - `S22-08`: Errores de programación con tipo y frames internos útiles, sin stack en la respuesta HTTP.
     - `S22-09`: Correlación entre commit, `after()` y SQL; raíz técnica independiente para el cron.
     - `S22-26 / S22-29`: Persistencia de contexto mínimo (`telemetryTraceId` de 32 hex y `telemetrySpanId` de 16 hex) en `HcsPublication`, ausencia de cookies o credenciales en la outbox, y drenaje honesto en cron sin fabricación de trazas para filas históricas con contexto nulo.
4. **Regresiones de seguridad y CLI:**
   - `tests/api/seguridad.test.ts`: 34 pruebas aprobadas sin regresión.
   - `tests/cli/entrega.test.ts`: 24 pruebas aprobadas con el inventario de migraciones actualizado.
5. **Puertas de compilación:**
   - `npm run typecheck`, `npm run typecheck:strict` y `npm run typecheck:api`: 0 errores de tipado.
   - `npm run lint`: 234 archivos comprobados sin advertencias.
   - `npm run build`: Compilación de producción con Turbopack completada exitosamente.
