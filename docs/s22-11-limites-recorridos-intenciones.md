# S22-11 · Límites de recorridos, intenciones, lecturas y comandos privados

## Techos compartidos por sesión, recorrido y día UTC

Siguiendo las decisiones `D02` y `D08` de la especificación S22, el servicio protege todas las entradas privadas con límites compartidos en PostgreSQL (`RequestRateBucket`) mediante la migración aditiva [`202611020002_private_and_intent_admission`](../prisma/migrations/202611020002_private_and_intent_admission/migration.sql), que amplía `RequestRateBucket_scope_check` (`'PRIVATE_READ'`, `'MUTATION'`, `'PUBLICATION'`, `'INTENT_CREATE'`, `'RUN_INTENT'` y `'SESSION_INTENT'`) y ajusta `RequestRateBucket_used_check` para admitir hasta `5000` en `'INTENT_CREATE'` manteniendo `<= 1000` en los demás ámbitos:

- **Lecturas privadas (`PRIVATE_READ`):** **30 por minuto por sesión** y **1.000 por minuto global** (ventana fija de 60 s). Se aplica en `GET /api/demo/session`, `GET /api/demo/runs/current` y `GET /api/demo/runs/[traceId]`.
- **Intentos de mutación (`MUTATION`):** **10 por minuto por sesión** y **100 por minuto global** (ventana fija de 60 s). Se aplica en `POST /api/demo/runs`, `POST /api/demo/runs/reset`, `POST /api/demo/runs/[traceId]/commands` y `POST /api/demo/runs/[traceId]/events/[eventId]/retry`.
- **Activaciones de publicación (`PUBLICATION`):** **6 por minuto por sesión** y **60 por minuto global** (ventana fija de 60 s). Se aplica en `POST /api/demo/runs/[traceId]/events/[eventId]/retry` y dentro de `executeOperationCommand` cuando la acción genera o repite un hito publicable (`event !== null`).
- **Intenciones nuevas por recorrido (`RUN_INTENT`) y por sesión (`SESSION_INTENT`):** **100 recibos por recorrido** (`DEMO_POLICY.maxReceiptsPerRun = 100`), compartido entre todas las acciones de `CommandReceipt` (`SAVE`, `PUBLISH`, `APPROVE`, `REJECT`, `ASSIGN`, `PICKUP`, `RECEIVE`, `INCIDENT` y `RETRY_PUBLICATION`) para que no pueda evadirse cambiando de acción, y **100 intenciones de inicio/reinicio por sesión** (`SessionRunIntent`).
- **Intenciones nuevas por día UTC global (`INTENT_CREATE`):** **5.000 intenciones nuevas por día UTC global** (`DEMO_POLICY.intentDailyLimit = 5000`), reservado en la misma transacción que crea un `SessionRunIntent` o un `CommandReceipt` nuevo.

Todos los sujetos no globales en `RequestRateBucket` conservan un resumen hexadecimal de 64 caracteres (`sessionTokenHash(token)` para cubos por sesión y `runIntentSubject(run.id)` con SHA-256 prefijado por propósito para `RUN_INTENT`).

## Orden de validación, propiedad, idempotencia y fallo cerrado

1. **Rechazo temprano sin credencial válida:** `requireSessionRateLimit`, `recoverSession`, `resolveRunIntent`, `getCurrentRun`, `getOwnedRun` y `executeOperationCommand` verifican `sessionTokenHash(token)` en memoria y devuelven `401 SESSION_REQUIRED` antes de abrir transacciones o crear filas en `RequestRateBucket`. `Origin` y `X-Jopoi-Request: demo` actúan únicamente como defensas adicionales de mutación desde navegador y nunca como identidad.
2. **Propiedad y vigencia preceden al replay:** En `resolveRunIntent`, `executeOperationCommand` y `retryPublicationHttp`, la sesión y la propiedad/vigencia del recorrido (`requireSession` / `requireOwnedRun`) se comprueban dentro de la transacción antes de consultar `SessionRunIntent` o `CommandReceipt`. Otra sesión nunca puede descubrir ni reproducir un recibo ajeno (`404 NOT_FOUND`), y una sesión o recorrido vencido responde `401 SESSION_EXPIRED` / `404 NOT_FOUND` antes de cualquier replay.
3. **Separación entre capacidad de solicitud y reserva de intención/negocio:** Repetir la misma solicitud consume la ventana por minuto (`MUTATION` y, cuando aplica, `PUBLICATION`), pero si el `requestId` ya fue confirmado con idéntico `intentHash`, devuelve el resultado previo (`replayed: true`) sin consumir otro recibo (`RUN_INTENT` / `SESSION_INTENT`), otro cupo diario (`INTENT_CREATE`), otro recorrido (`runCount`) ni cuota de negocio HCS. Si el mismo `requestId` se reutiliza con otra acción o carga útil, responde `409 IDEMPOTENCY_CONFLICT` antes de consumir `RUN_INTENT` o `INTENT_CREATE`.
4. **Atomicidad y ausencia de efectos colaterales ante rechazo:** En `executeOperationCommand` y `retryPublicationHttp`, `reserveRunIntent` (y `reserveSessionRateLimit` para `PUBLICATION`) se ejecutan en la misma transacción SQL que inserta el recibo. Si cualquier límite rechaza con `429 RATE_LIMITED` o si el contador no está disponible (`503`), la transacción completa hace rollback sin dejar recibo, evento, incremento de versión, cambio de estado ni programación de `schedulePublications`.

## Contrato OpenAPI y preservación de intención en el panel

- [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y [`public/openapi.json`](../public/openapi.json) documentan en `x-rate-limit` los techos por minuto por sesión/global y los techos de 100 recibos por recorrido y 5.000 intenciones nuevas por día UTC en todas las rutas privadas (`/api/demo/session`, `/api/demo/runs`, `/api/demo/runs/reset`, `/api/demo/runs/current`, `/api/demo/runs/{traceId}`, `/api/demo/runs/{traceId}/commands` y `/api/demo/runs/{traceId}/events/{eventId}/retry`).
- En el panel operativo, recibir `429` o `503` coloca la acción en estado incierto, muestra el tiempo de espera derivado de `Retry-After` y conserva la intención capturada (`requestId` y `expectedVersion`) para que el reintento manual envíe exactamente los mismos bytes.

## Evidencia local

### Iteraciones de verificación y hallazgos corregidos

1. **Primera corrida E2E (`S22-UI-02`):** El escenario nuevo falló inicialmente por buscar el botón como `"Publicar lote en origen"` en lugar del texto real del control (`"Publicar lote"`). En la segunda corrida, fijar `runtime.clock("2026-01-01T12:00:00.000Z")` hizo que `Set-Cookie` emitiera `Expires=02 Jan 2026`, fecha pasada respecto del reloj nativo del navegador (`2026-11-02`), causando que el navegador descartara `jopoi_session`. Al alinear el reloj sintético del servidor con el inicio del minuto actual (`Math.ceil(Date.now() / 60000) * 60000`), `S22-UI-02` y la suite completa de 8 escenarios en `tests/e2e/seguridad.spec.ts` aprobaron en `chromium-desktop` y `webkit-mobile`.
2. **Primera corrida de `quality:check`:**
   - `typecheck` detectó que `Visitor.get` en `tests/support/client.ts` no aceptaba el segundo parámetro opcional `headers`; se amplió su firma.
   - `test:cli` falló al importar `src/server/security/rate-limit.ts` (que declara `import "server-only"`) desde `tests/cli/seguridad.test.ts`; se trasladó la función pura `runIntentSubject` a [`src/server/security/visitor-identity.ts`](../src/server/security/visitor-identity.ts) (reexportándola desde `rate-limit.ts`).
   - En `test:api`, aprobaron las 58 pruebas previas y fallaron únicamente los dos casos nuevos (`S22-02` y `S22-03`): en `S22-02`, `noisy.command(...)` invocaba internamente `this.run()` (`PRIVATE_READ`) inmediatamente después de haber agotado a propósito las 30 lecturas privadas de `noisy`; y en `S22-03`, fijar `used = 5000` en `INTENT_CREATE` chocó con `RequestRateBucket_used_check` (`used <= 1000`). Se actualizó la migración `202611020002_private_and_intent_admission` para permitir `used <= 5000` en `'INTENT_CREATE'` y se usó `noisy.post` directo en `S22-02`.

### Puerta integral reproducible (`scripts/quality.ts`)

La ejecución completa de `scripts/quality.ts` aprobó con código de salida `0`:

- `db:generate`, `db:validate`, `typecheck`, `typecheck:api`, `lint` y `api:check`: aprobados.
- `typecheck:report`: **0 diagnósticos** en el perfil estricto global obligatorio (`.cache/quality/strict-report.json`, generado `2026-11-02T15:54:14.802Z`).
- `test:contracts`: **8/8** aprobadas.
- `test:quality`: **9/9** aprobadas.
- `test:security`: **7/7** aprobadas.
- `test:domain`: **54/54** aprobadas.
- `test:observability`: **4/4** aprobadas.
- `test:cli`: **24/24** aprobadas (incluyendo `runIntentSubject` y límites de `DEMO_POLICY` en `S22-04`).
- `test:ui:tokens`: **2/2** aprobadas.
- `test:api`: **8 archivos, 60/60 pruebas HTTP aprobadas** en 453,81 s (`S22-01`, `S22-02`, `S22-03`, `S22-04` y `S22-05` incluidos junto con la regresión completa `API-01..26`, `S21-01..15` y `S22-08..12`). Reporte HTTP en `.cache/api-tests/results/report.json`: `generatedAt: 2026-11-02T16:02:16.262Z`, `startupErrors: 0`, revisión base `84ff1a3bce0ee2711b013c8565b6d98962ff4a16` (`dirty: true`), huella de fuentes `bb46ec4693415903a309531d4ca5a59e99ac5a641b8c088e78ab46b871f4e3c5`.
- `build`: compilación de producción Next.js 16.4.2 aprobada.

### Navegador (Chromium desktop y WebKit móvil)

- Ejecución final de `tests/e2e/seguridad.spec.ts` (`--project=chromium-desktop --project=webkit-mobile`): **8/8 escenarios aprobados** (`S21-UI-01`, `S21-UI-02`, `S22-UI-01` y `S22-UI-02` en ambos navegadores) en 6,3 minutos.
- Reporte E2E en `.cache/e2e/report.json`: `generatedAt: 2026-11-02T17:02:35.666Z`, `status: "passed"`, revisión base `84ff1a3bce0ee2711b013c8565b6d98962ff4a16` (`dirty: true`), huella de fuentes `bb46ec4693415903a309531d4ca5a59e99ac5a641b8c088e78ab46b871f4e3c5` (idéntica a la del reporte HTTP).
