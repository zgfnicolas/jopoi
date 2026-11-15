# S22-12 · Limpieza sostenible, justa y recuperable de datos vencidos

## Política de tandas deterministas y progreso justo por categoría (`D03`, `D14`)

Para cerrar los hallazgos `AUD-02` y `AUD-17`, el mantenimiento compartido entre `/api/cron` y `scripts/maintenance.ts` reemplaza el borrado único sin orden por un ciclo cooperativo de rondas intercaladas definido en [`src/server/hedera/maintenance-policy.ts`](../src/server/hedera/maintenance-policy.ts) y ejecutado por [`src/server/hedera/maintenance-core.ts`](../src/server/hedera/maintenance-core.ts):

- **Presupuesto cooperativo y reserva de cierre:** Cada ejecución opera bajo un presupuesto de `45.000 ms` (`CLEANUP_POLICY.cooperativeBudgetMs`) y detiene el inicio de nuevas transacciones de limpieza cuando restan menos de `14.000 ms` (`CLEANUP_POLICY.closingReserveMs`), reservando tiempo para la observación final, el drenaje acotado de publicaciones (`deadline - 7000`) y la liberación atómica del `MaintenanceLease`.
- **Dimensionamiento sensible a hijos acotados de `DemoRun`:** Un agregado `DemoRun` en sus topes admisibles contiene hasta **`231` filas** (`1` `DemoRun` + `100` `CommandReceipt` + `100` `SessionRunIntent` + `5` `OperationEvent` + `5` `HcsPublication` + `20` `HcsSubmissionAttempt`). Con un presupuesto máximo de `6.000` filas por cascada SQL, el lote unitario de recorridos queda fijado en **`RUN_BATCH_SIZE = 25`** (`25 * 231 = 5.775 <= 6.000`).
- **Intercalación justa por ronda (`maxRounds = 12`):** En cada ronda se recorren en orden determinista las seis categorías (`rateBuckets`, `runs`, `contacts`, `sessions`, `quotas`, `leases`):
  - `rateBuckets`: hasta `250` filas por ronda (`ORDER BY "expiresAt" ASC, "scope" ASC, "subject" ASC, "windowStart" ASC`) → hasta `3.000` por ejecución.
  - `runs`: hasta `3` sub-lotes (`DEMO_POLICY.maxRunsPerSession`) de `25` recorridos por ronda (`ORDER BY "expiresAt" ASC, "sessionId" ASC, "ordinal" ASC`) → hasta `75` recorridos por ronda y **`900` recorridos por ejecución** (`3×` la admisión diaria máxima de `300` recorridos/día). Ordenar por `("expiresAt" ASC, "sessionId" ASC, "ordinal" ASC)` libera determinísticamente las `25` sesiones padre correspondientes dentro de la misma ronda.
  - `contacts`: `1` lote de `25` por ronda (`ORDER BY "expiresAt" ASC, "id" ASC`) → hasta **`300` contactos por ejecución** (`3×` la admisión diaria máxima de `100` contactos/día).
  - `sessions`: `1` lote de `25` sesiones sin recorridos hijos (`runs: { none: {} }`, `ORDER BY "expiresAt" ASC, "id" ASC`) → hasta **`300` sesiones por ejecución** (`3×` la admisión diaria máxima de `100` sesiones/día).
  - `quotas`: `1` lote de `25` cuotas con más de 8 días UTC (`ORDER BY "date" ASC, "scope" ASC`) → hasta `300` por ejecución.
  - `leases`: `1` lote de `25` leases de publicación vencidos (`ORDER BY "leaseExpiresAt" ASC, "eventId" ASC`) → hasta `300` por ejecución.

##Convergencia tras caída de `cron` y protección de integridad (`S22-05`, `S22-06`)

1. **Convergencia tras 7 días sin `cron`:** Con la admisión diaria al 100% (`100` sesiones/día, `300` recorridos/día y `100` contactos/día), 7 días sin `cron` acumulan `700` sesiones, `2.100` recorridos y `700` contactos vencidos. Cada ejecución exitosa elimina hasta `300` sesiones, `900` recorridos y `300` contactos (3 días de carga máxima): tras 2 ejecuciones el atraso baja a `1` día (`100` sesiones, `300` recorridos y `100` contactos) y tras la 3.ª ejecución converge a `0` (`<= 1` día).
2. **Protección de leases activos e invariantes:** `cleanCategoryBatch` nunca elimina un `DemoRun` que tenga algún `HcsPublication` con `leaseExpiresAt > now()`, ni una `DemoSession` que aún conserve recorridos hijos (`ON DELETE RESTRICT`). Si una categoría falla (salvo pérdida del `MaintenanceLease`, que aborta con `STATE_CONFLICT`), se registra `MAINTENANCE_CATEGORY_FAILED`, la categoría se marca en `stalledCategories` y el resto de las categorías continúa avanzando sin presentar la ejecución como completa (`cleanupComplete: false`, `complete: false`).
3. **Separación entre denegación lógica inmediata, objetivo físico de `36 h` y salud del programador:** Las rutas HTTP (`/api/traces/[traceId]`, `/api/demo/session`, `/api/demo/runs/...`) siguen denegando inmediatamente (`410`/`401`/`404`) por `expiresAt <= now()` aunque la fila aún aguarde limpieza física. `observeCleanupState` mide `oldestExpiredAgeMs` y `withinRetentionTarget` (`<= 36 h`) sobre los elementos elegibles para borrado físico, mientras que `scripts/ops-status.ts` expone además `schedulerHealthy` para distinguir un fallo del programador (`cron`) de un elemento recién vencido dentro de la ventana normal de `36 h`.

## Observabilidad operativa y reloj controlado (`D16`, `S22-27`)

- La migración aditiva [`202611020003_maintenance_observability`](../prisma/migrations/202611020003_maintenance_observability/migration.sql) agrega `lastCompletedAt` y `lastPartialAt` (`TIMESTAMPTZ(3)`) a `"MaintenanceLease"` y se registra en `EXPECTED_MIGRATIONS` ([`src/server/delivery/preflight.ts`](../src/server/delivery/preflight.ts)).
- Tanto `/api/cron` (documentado en [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y [`public/openapi.json`](../public/openapi.json)) como `scripts/maintenance.ts`, `scripts/ops-status.ts` y el evento estructurado `maintenance.completed` ([`src/server/hedera/maintenance-log.ts`](../src/server/hedera/maintenance-log.ts)) exponen `counts`, `pending` (`expiredAwaitingCleanup` en `ops-status`), `oldestExpiredAgeMs`, `withinRetentionTarget`, `stalledCategories`, `lastCompletedAt` y `lastPartialAt` sin incluir PII, hashes, tokens ni payloads.
- [`scripts/maintenance.ts`](../scripts/maintenance.ts) y [`scripts/ops-status.ts`](../scripts/ops-status.ts) leen el tiempo actual desde `@/server/runtime/clock` (y el proveedor HCS desde `@/server/runtime/network`), permitiendo probar escenarios de múltiples días con reloj controlado sin ramas de prueba en producción.

## Evidencia local

### Iteraciones de verificación y hallazgos corregidos

1. **Primera corrida de `scripts/quality.ts`:** `typecheck` detectó que `DEMO_POLICY` en [`src/shared/demo-policy.ts`](../src/shared/demo-policy.ts) definía `maxReceiptsPerRun` pero aún no exportaba las constantes explícitas `maxRunIntentsPerSession` (`100`), `maxEventsPerRun` (`5`) y `maxSubmissionAttemptsPerEvent` (`4`) usadas para calcular `MAX_ROWS_PER_RUN_AGGREGATE = 231`. Se incorporaron a `DEMO_POLICY`.
2. **Segunda y tercera corrida de `scripts/quality.ts`:**
   - En `observeCleanupState`, contar sesiones con `expiresAt <= at` que todavía tenían un `DemoRun` vigente (`expiresAt > at`, retenido 7 días para trazabilidad pública aunque la cookie de sesión dure 24 h) hacía que una sesión respaldando una traza vigente figurara prematuramente como pendiente de borrado físico. Se restringió `pending.sessions` a sesiones vencidas cuyos recorridos hijos también estén vencidos (`runs: { every: { expiresAt: { lte: at } } }`), y en `stalledCategories` se reportó `runs` cuando `pending.runs > 0 && eligibleRuns === 0` y `sessions` cuando `pending.sessions > 0 && eligibleSessions === 0 && eligibleRuns === 0`.
   - En `S22-05`, ordenar `DemoRun` por `("expiresAt" ASC, "id" ASC)` distribuía los `75` recorridos borrados por ronda entre las `100` sesiones del mismo día según el hash UUID del recorrido, liberando solo `260` sesiones en vez de `300` al cabo de las `12` rondas. Al cambiar el orden a `("expiresAt" ASC, "sessionId" ASC, "ordinal" ASC)`, cada ronda elimina los 3 recorridos de `25` sesiones contiguas y libera exactamente `25` sesiones por ronda (`300` sesiones y `900` recorridos por ejecución).
3. **Cuarta corrida de `scripts/quality.ts`:** `S22-05` y `S22-06` aprobaron, pero se observaron dos fricciones del arnés bajo carga con reloj congelado: `Visitor.apply` en `tests/support/client.ts` exigía dos lecturas privadas consecutivas (`stable >= 2`) para `verificationState === "MATCHED"`, agotando el techo de 30 `PRIVATE_READ`/minuto en `API-10`, y `rename("clock.json.next", "clock.json")` en `tests/support/runtime.ts` podía recibir `EPERM` transitorio en Windows si el proceso servidor leía `clock.json` en ese mismo instante. Se simplificó `Visitor.apply` a una confirmación terminal única y se agregó reintento breve ante bloqueo transitorio de archivo en `tests/support/runtime.ts` y `tests/support/clock.ts`.

### Puerta integral reproducible (`scripts/quality.ts`)

La ejecución completa de `scripts/quality.ts` aprobó con código de salida `0`:

- `db:generate`, `db:validate`, `typecheck`, `typecheck:api`, `lint` y `api:check`: aprobados.
- `typecheck:report`: **0 diagnósticos** en el perfil estricto global obligatorio (`.cache/quality/strict-report.json`, generado `2026-11-02T18:36:30.384Z`).
- `test:contracts`: **8/8** aprobadas (incluyendo validación OpenAPI 3.2 del nuevo esquema `Maintenance`).
- `test:quality`: **9/9** aprobadas.
- `test:security`: **7/7** aprobadas.
- `test:domain`: **54/54** aprobadas.
- `test:observability`: **4/4** aprobadas.
- `test:cli`: **24/24** aprobadas (incluyendo invariantes de `CLEANUP_POLICY`, `MAX_ROWS_PER_RUN_AGGREGATE = 231` y `RUN_BATCH_SIZE = 25`).
- `test:ui:tokens`: **2/2** aprobadas.
- `test:api`: **8 archivos, 61/61 pruebas HTTP aprobadas** en 554,05 s (incluyendo `S21-07`, `S22-05` y `S22-06` junto con toda la regresión `API-01..26`, `S21-01..15` y `S22-01..12`). Reporte HTTP en `.cache/api-tests/results/report.json`: `generatedAt: 2026-11-02T18:46:14.458Z`, `startupErrors: 0`, revisión base `d917a7b9b8b2aefe89f8cb2f50f8179ffcc3ab90` (`dirty: true`), huella de fuentes `703cfb58644304960aef58e81a03c72832f8e9880d2211025c8fd6cbe834e248`.
- `build`: compilación de producción Next.js 16.4.2 aprobada.
