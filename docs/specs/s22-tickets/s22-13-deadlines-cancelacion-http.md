# S22-13 · Deadlines, cuerpos lentos y cancelación HTTP (`D14`, `D15`, `AUD-17`)

## Presupuesto total por solicitud y acotamiento por paso (`D14`)

Para cerrar el hallazgo `AUD-17` y evitar que lecturas de cuerpo, esperas de pool SQL y llamadas a Mirror Node sumen timeouts independientes sin techo, [`src/server/deadlines.ts`](../src/server/deadlines.ts) centraliza la política `DEFAULT_DEADLINE_POLICY` (inyectable en pruebas mediante `@/server/runtime/deadlines` → [`src/server/runtime/deadlines.ts`](../src/server/runtime/deadlines.ts) / [`tests/support/deadlines.ts`](../tests/support/deadlines.ts)):

| Operación / Paso | Presupuesto por defecto | Relación con el deadline total |
| --- | --- | --- |
| Lecturas (`session.read`, `runs.current`, `runs.read`, `traces.read`) | `readDeadlineMs = 8.000 ms` | Cota total en `RequestContext.deadlineAt` creada por `apiBoundary`. |
| Mutaciones (`session.create`, `runs.start`, `runs.reset`, `runs.command`, `publications.retry`, `contacts.create`) | `mutationDeadlineMs = 10.000 ms` | Cota total de la mutación HTTP (la continuación asíncrona `publications.drain` recibe su propio contexto hijo de `45.000 ms` sin señal del cliente). |
| Lectura de cuerpo (`readJsonBody`) | `bodyReadTimeoutMs = 3.000 ms` | Acotada por `Math.min(policy.bodyReadTimeoutMs, remainingRequestMs)`, además del tope de bytes (`4.096 B` en mutaciones privadas y `16.384 B` en `/api/demo-requests`). |
| Espera de pool y transacción SQL (`sqlStepBudget`) | `sqlMaxWaitMs = 2.000 ms`, `sqlTimeoutMs = 5.000 ms` | `sqlStepBudget(policy, remainingRequestMs)` garantiza siempre `maxWait + timeout <= remainingRequestMs` (y rechaza con `503 DATABASE_UNAVAILABLE` si restan `<= 50 ms`). |
| Contraste remoto completo (`traces.verify`) | `verificationDeadlineMs = 10.000 ms` | Reserva `verificationClosingReserveMs = 1.500 ms` para la verificación SQL de cierre; el presupuesto de Mirror Node es `mirrorVerificationBudgetMs = Math.min(6.000, remaining - 1.500)` con `mirrorStepTimeoutMs = 3.000 ms` por llamada HTTP. |

## Lectura de cuerpos sin `Content-Length` fiable y liberación de streams

En [`src/server/http.ts`](../src/server/http.ts), `readJsonBody(request, maxBytes, timeoutOverrideMs?)`:

1. Valida `Content-Length` cuando está presente, pero **nunca confía en él**: lee chunk a chunk desde `request.body.getReader()` verificando en cada fragmento que el acumulado no supere `maxBytes`.
2. Compite cada `reader.read()` contra un temporizador acotado por `Math.min(timeoutOverrideMs ?? policy.bodyReadTimeoutMs, remainingRequestMs)` y contra `request.signal` (`abort`).
3. Ante exceso de bytes, vencimiento del plazo, aborto del cliente o JSON inválido, ejecuta `reader.cancel()`, limpia el temporizador y el listener de `abort`, libera el lock (`reader.releaseLock()`) en `finally` y responde `400 INVALID_INPUT` (negociado en Problem Details o envoltorio heredado).

## Contraste remoto acotado (`<= 10 s`) que preserva la historia confirmada (`D15`, `S22-24`)

- En [`src/server/hedera/mirror.ts`](../src/server/hedera/mirror.ts), `mirrorJson`, `lookupTransaction` y `verifyMessage` combinan `AbortSignal.timeout(stepTimeout)` (`3.000 ms`), el presupuesto total de Mirror Node (`6.000 ms`) y la señal de cancelación externa (`signal`).
- En [`src/server/traces/queries.ts`](../src/server/traces/queries.ts) (`createTraceReader.getVerification`), si la consulta al Mirror Node vence su presupuesto antes de consumir la reserva de cierre (`1.500 ms` dentro del techo total de `10 s`), se aborta la petición remota, se registra el diagnóstico estructurado `publication.recovered` con `code: "HCS_MIRROR_UNAVAILABLE"` (`outcome: "partial"`, `severity: "WARN"`) y se devuelve `200 OK` con:
  - `state: "UNAVAILABLE"`,
  - `observation: { state: "UNAVAILABLE", code: "HCS_MIRROR_UNAVAILABLE", evidence: ... }`,
  - `publication` intacto (`CONFIRMED` y su `transactionId` original),
  - `storedVerification` intacto (`MATCHED`).
  Nunca se inventa coincidencia (`MATCHED`), discrepancia (`MISMATCH`) ni fallo definitivo (`FAILED`).

## Cancelación de lecturas vs. incertidumbre en mutaciones (`D15`)

1. **Lecturas (`isReadOperation(operation) === true`):** `apiBoundary` propaga `request.signal` en `RequestContext.clientSignal`. Si el cliente desconecta durante una lectura:
   - `withDatabase`, `withTransaction`, `requireRateLimit` y `requireSessionRateLimit` abortan mediante `raceWithReadAbort` y no abren transacciones posteriores.
   - `getVerification` aborta de inmediato la llamada en vuelo al Mirror Node y omite la transacción SQL de cierre.
2. **Mutaciones (`isReadOperation(operation) === false`):**
   - Si el cliente desconecta mientras transmite el cuerpo, `readJsonBody` aborta antes de iniciar cualquier escritura SQL.
   - Una vez leído el cuerpo, `RequestContext.clientSignal` no se adjunta a la transacción SQL ni al drenaje asíncrono (`childContext(parent, "publications.drain")` limpia `clientSignal` y asigna su propio deadline), por lo que una desconexión del cliente nunca se presenta como rollback.
   - En el cliente ([`src/frontend/operation-api.ts`](../src/frontend/operation-api.ts) y [`src/frontend/use-operation-panel.ts`](../src/frontend/use-operation-panel.ts)), un corte de red o aborto devuelve `status: null`, `code: "NETWORK_UNAVAILABLE"`, transiciona el panel a `uncertain` (`canCreateIntent = false`) y exige reintentar con el mismo `requestId`, obteniendo `replayed: true` cuando la mutación ya había sido confirmada.
3. **Clasificación de `P2028` y ausencia de `Retry-After` fabricado en SQL:** [`src/server/database/errors.ts`](../src/server/database/errors.ts) incluye `P2028` (timeout de espera o ejecución de transacción interactiva en Prisma) en `UNAVAILABLE_CODES` (`503 DATABASE_UNAVAILABLE`) sin inventar cabecera `Retry-After` cuando se desconoce el tiempo de recuperación de PostgreSQL.

## Evidencia local

### Iteraciones de verificación y hallazgos corregidos

1. **Primera corrida de `tests/contracts/boundary.test.ts` y `tests/contracts/transports.test.ts`:**
   - Se observó que `sqlStepBudget` acotaba `maxWait` y `timeout` por separado frente a `remainingRequestMs`, permitiendo que `maxWait + timeout` superara el presupuesto restante cuando `remainingRequestMs < 7.000 ms`. Se ajustó `sqlStepBudget` en [`src/server/deadlines.ts`](../src/server/deadlines.ts) para asignar `maxWait <= 0.3 * remaining` y `timeout <= remaining - maxWait`, cumpliendo siempre `maxWait + timeout <= remainingRequestMs`.
2. ** Ejecución aislada de `S22-24` en `tests/api/seguridad.test.ts`:**
   - Enviar un `ReadableStream` con cabecera explícita `Content-Length: "2"` desde `fetch` de Node 24 (Undici) fallaba en el cliente antes de transmitir la solicitud (`UND_ERR_REQ_CONTENT_LENGTH_MISMATCH`). Se mantuvo la prueba de `Content-Length` falso directamente sobre `readJsonBody(new Request(...))` en [`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts) y en HTTP real (`S22-24`) se transmitió el stream sobredimensionado mediante `Transfer-Encoding: chunked` sin `Content-Length`.
   - Se cerró explícitamente el controlador del `ReadableStream` lento en el cliente tras recibir la respuesta `400` y se limpiaron los listeners de conexiones cerradas en `waitHeld` ([`tests/support/ledger.ts`](../tests/support/ledger.ts)) para evitar escrituras tardías sobre sockets IPC ya cerrados por timeout o aborto.
   - Se agregó `P2028` a `UNAVAILABLE_CODES` en [`src/server/database/errors.ts`](../src/server/database/errors.ts) y se activaron los deadlines cortos de prueba después de la compilación inicial de la ruta en `next dev`.

### Puerta integral reproducible (`scripts/quality.ts`)

La ejecución completa de `scripts/quality.ts` aprobó con código de salida `0`:

- `db:generate`, `db:validate`, `typecheck`, `typecheck:api`, `lint` y `api:check`: aprobados (`public/openapi.json` SHA-256: `99f0ca5787f0d2b5b1ff2bf5ff82199907816f26ff359d62189307494991d22c`).
- `typecheck:report`: **0 diagnósticos** en el perfil estricto global obligatorio (`.cache/quality/strict-report.json`).
- `test:contracts`: **12/12** aprobadas (`tests/contracts/openapi.test.ts`, `tests/contracts/transports.test.ts`, `tests/contracts/boundary.test.ts`).
- `test:quality`: **9/9** aprobadas.
- `test:security`: **7/7** aprobadas.
- `test:domain`: **54/54** aprobadas.
- `test:observability`: **4/4** aprobadas.
- `test:cli`: **24/24** aprobadas.
- `test:ui:tokens`: **2/2** aprobadas.
- `test:api`: **8 archivos, 62/62 pruebas HTTP aprobadas** en 496,74 s (incluyendo `S22-24` en `11.696 ms` junto con toda la regresión `API-01..26`, `S21-01..15` y `S22-01..12`). Reporte HTTP en `.cache/api-tests/results/report.json`: `generatedAt: 2026-11-02T19:40:08.005Z`, `startupErrors: 0`, revisión base `2de685078ad1ca937d172fca5b36aa50674ed89e` (`dirty: true`), huella de fuentes `5b8f1891593f95de2dbbaef21313a5cc68c7337a2de7f43cdf787f210a4121f9`.
- `build`: compilación de producción Next.js 16.4.2 aprobada.
