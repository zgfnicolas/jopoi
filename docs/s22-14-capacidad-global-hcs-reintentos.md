# S22-14 · Publicar y contrastar con capacidad global y recuperación segura (`D02`, `D03`, `D13`, `D15`, `AUD-01`, `AUD-17`)

## Capacidad externa global antes de preparar o contrastar (`D15`)

Para impedir que varias instancias o drenajes solapados saturen las dependencias externas (SDK de firma/preparación, envío a testnet y Mirror Node), [`src/server/hedera/capacity.ts`](../src/server/hedera/capacity.ts) define la política `EXTERNAL_CAPACITY_POLICY`:

| Parámetro | Valor | Propósito |
| --- | --- | --- |
| `slots` | `2` | Techo inicial de llamadas costosas en vuelo globales (dos instancias pueden preparar o contrastar a la vez). |
| `permitTtlMs` | `60.000 ms` | Expiración/fencing del permiso: cubre la secuencia externa acotada de un único poseedor sin mantener SQL abierto. |
| `busyCooldownMs` | `15.000 ms` | Cooldown mínimo antes de que una publicación diferida vuelva a ser elegible. |
| `acquireAttempts` | `3` | Reintentos acotados ante conflictos de serialización entre instancias. |

`createExternalCapacity` reserva un slot reutilizando la coordinación SQL de [`MaintenanceLease`](../prisma/schema.prisma): `acquire()` crea idempotentemente los nombres `EXTERNAL_CAPACITY_0/1` (`createMany` con `skipDuplicates`) y reclama un slot libre (`owner` nulo, `expiresAt` nulo o vencido) con un `updateMany` atómico; `release(permit)` sólo libera si el `owner` coincide con el del permiso, de modo que un trabajador vencido **no libera el slot ya reclamado por su sucesor**.

La migración [`202611040001_external_capacity_slots`](../prisma/migrations/202611040001_external_capacity_slots/migration.sql) relaja `MaintenanceLease_name_check` para admitir `DAILY_MAINTENANCE` o `EXTERNAL_CAPACITY_[0-9]+`, sin reescribir ninguna migración aplicada ni debilitar el resto de invariantes de la tabla.

## Cableado en el coordinador y rechazo temprano

En [`src/server/hedera/coordinator.ts`](../src/server/hedera/coordinator.ts), `processEvent` reserva **un permiso por recorrido procesado** inmediatamente después de reclamar el lease de publicación y lo libera en `finally`, de modo que `prepare`, `submit`, `reconcile` y `verify` (todas las llamadas externas) ocurren siempre bajo el permiso, y **ninguna transacción SQL permanece abierta mientras se usa el permiso**:

1. `claim(eventId)` toma el lease de publicación (fencing por `leaseOwner`/`leaseExpiresAt`, `90 s`).
2. `capacity.acquire()` reserva el slot global. Si devuelve `null`, se ejecuta el **rechazo temprano**: la publicación conserva su estado honesto (`QUEUED`, `IN_FLIGHT` o `UNCERTAIN` según corresponda), se fija `lastErrorCode = "HCS_CAPACITY_BUSY"` y `nextAttemptAt = now + busyCooldownMs + jitter`, y `processEvent` devuelve `false` sin tocar el proveedor.
3. El `finally` libera el lease de publicación y luego el permiso de capacidad.

`HCS_CAPACITY_BUSY` ya forma parte de [`HCS_CODES`](../src/server/hedera/contracts.ts) y, por tanto, se expone de forma segura en [`publicationSummary`](../src/server/hedera/summary.ts) y en el resumen de [`scripts/ops-status.ts`](../scripts/ops-status.ts), sin inventar confirmación.

## Límite distinto del lease, la cuota diaria y el máximo de intentos (`D02`, `D03`)

| Control | Mecanismo | Techo |
| --- | --- | --- |
| Capacidad externa global | `MaintenanceLease` con nombre `EXTERNAL_CAPACITY_<índice>` | `2` llamadas en vuelo globales |
| Lease de publicación | `HcsPublication.leaseOwner` / `leaseExpiresAt` | `90 s` por evento |
| Cuota diaria de envíos | `DailyQuota` `HCS_GLOBAL` | `100` mensajes/día UTC |
| Máximo de intentos | `automaticAttempts` + `manualAttempts` en `HcsSubmissionAttempt` | `3` automáticos + `1` manual |

No existe bypass por otra entrada: cron ([`maintenance-core.ts`](../src/server/hedera/maintenance-core.ts)) y el reintento HTTP ([`retry.ts`](../src/server/hedera/retry.ts) → [`service.ts`](../src/server/hedera/service.ts) `schedulePublications`) convergen en `createCoordinator().drain()`, y sólo `processEvent` ejecuta llamadas externas, siempre detrás de `capacity.acquire()`.

## Elegibilidad con jitter acotado (`D15`)

[`src/server/hedera/retry-policy.ts`](../src/server/hedera/retry-policy.ts) define `RETRY_JITTER_POLICY` (`ratio = 0.2`, `maxJitterMs = 120.000`) y `eligibleAt(now, cooldownMs, expiresAt, sample)`:

- El cooldown es un **suelo**: el jitter sólo agrega dispersión, nunca acorta el mínimo.
- El jitter está acotado (`[0, 1)` recortado a `0.999999`; el tramo añadido nunca supera `maxJitterMs` ni el vencimiento del recorrido cuando el cooldown solo cabría).
- La muestra proviene de un seam inyectable: [`src/server/runtime/jitter.ts`](../src/server/runtime/jitter.ts) (`Math.random` en producción) se sustituye por [`tests/support/jitter.ts`](../tests/support/jitter.ts) (determinista, `0` por defecto) mediante `tsconfig.api.json`.

## Transacción incierta, fencing y orden de hitos (`D13`)

- **Identidad conservada y sólo reconciliación:** si el intento está `STARTED`/`UNCERTAIN` (o `REJECTED` con el mismo `transactionId`), `processEvent` llama a `provider.reconcile(transactionId, topicId)` y resuelve `outcome` con la **misma** identidad, sin re-preparar ni reenviar. El envío `unknown`/`timeout` conserva `transactionId` (regresión `API-15`).
- **Trabajador vencido no confirma ni libera al sucesor:** `outcome` y las mutaciones pasan por `load()`, que exige `leaseOwner === owner` y `leaseExpiresAt > now`; `capacity.release` exige `owner === permit.owner`. Un poseedor vencido no puede confirmar un resultado ni limpiar el slot ya reclamado por otro.
- **Predecesores mantienen orden:** `predecessor(tx, row)` y la proyección SQL de `eligible()` descartan cualquier evento con un hito anterior no `CONFIRMED`, impidiendo adelantamientos incluso ante solapamiento de trabajadores (`API-19`).

## Estados honestos bajo saturación (`D02`, `AUD-01`)

- Bajo saturación de capacidad, la publicación **no** se marca `FAILED` ni `CONFIRMED`: permanece en su estado real con `lastErrorCode = "HCS_CAPACITY_BUSY"` y `nextAttemptAt` futuro; la red no recibe preparación ni envío (regresión `API-21`).
- Al liberar los slots (o al vencer el permiso) y superar el cooldown, cron reanuda el mismo evento sin duplicar envíos (`API-21`, `API-22`).
- No se incorpora un circuit breaker: el ensayo de caída demuestra que el límite de capacidad, el cooldown/jitter, el fencing de lease y el rechazo temprano bastan para no saturar la dependencia; un breaker queda reservado para una medición que pruebe lo contrario (`D15`).

## Evidencia local

### Iteraciones de verificación y hallazgos corregidos

1. **`MaintenanceLease_name_check` rechazaba los slots de capacidad.** Al cablear `capacity.acquire()` en el coordinador, el drenaje fallaba en `createMany({ name: "EXTERNAL_CAPACITY_0" })` por la restricción `CHECK ("name" = 'DAILY_MAINTENANCE')`. Se añadió la migración aditiva [`202611040001_external_capacity_slots`](../prisma/migrations/202611040001_external_capacity_slots/migration.sql), que relaja la restricción a `DAILY_MAINTENANCE` o `EXTERNAL_CAPACITY_[0-9]+`, y se registró en el inventario revisado de [`src/server/delivery/preflight.ts`](../src/server/delivery/preflight.ts). Sin esa migración el drenaje no publicaba nada (verificado por el fallo inicial de la suite: `RUN_FAILED_429` por agotamiento de lecturas privadas al reintentar un evento permanentemente `QUEUED`).
2. **`API-17` asumía prepares concurrentes ilimitados.** La prueba usaba `prepare-hold` para retener tres preparaciones en vuelo, lo que ahora contradice el techo de dos llamadas globales. Se reescribió para drenar de forma determinista (tres eventos, cuota diaria `1`, un envío y dos `PAUSED_QUOTA`), conservando su propósito original: la cuota global limita a un envío y las acciones SQL persisten.
3. **Sin circuit breaker adicional.** El ensayo de saturación (`API-21`) y el de permisos vencidos (`API-22`) demuestran que límite de capacidad, cooldown con jitter, fencing de lease y rechazo temprano bastan; un breaker queda reservado para una medición que pruebe que estos controles no alcanzan (`D15`).

### Puerta integral reproducible

La ejecución completa aprobó con código de salida `0`:

- `db:generate` (vía `build`), `db:validate`, `typecheck`, `typecheck:strict`, `typecheck:api`, `lint` y `api:check`: aprobados. `public/openapi.json` SHA-256: `99f0ca5787f0d2b5b1ff2bf5ff82199907816f26ff359d62189307494991d22c` (sin cambios respecto de S22-13; la capacidad no altera el contrato HTTP).
- `typecheck:report`: **0 diagnósticos** en el perfil estricto global obligatorio.
- `test:domain`: **54/54** aprobadas.
- `test:contracts`: **12/12** aprobadas.
- `test:security`: **7/7** aprobadas.
- `test:observability`: **4/4** aprobadas.
- `test:cli`: **24/24** aprobadas.
- `test:ui:tokens`: **2/2** aprobadas.
- `test:quality`: **9/9** aprobadas.
- `test:api`: **8 archivos, 64/64 pruebas HTTP aprobadas** (incluye las nuevas `API-21` «capacidad externa global: saturación rechaza temprano sin tocar la red y recupera al liberar» y `API-22` «permisos de capacidad vencidos se reclaman», junto con toda la regresión `API-01..26`, `S21-01..15` y `S22-01..24`). Reporte HTTP en `.cache/api-tests/results/report.json`: `startupErrors: 0`, revisión base `2de685078ad1ca937d172fca5b36aa50674ed89e` (`dirty: true`), huella de fuentes `cbf93c7a0d76437ed3bba6ffcf6a1a9f042aad44024197a338dc39b4f1328405`.
- `build`: compilación de producción Next.js 16.4.2 aprobada.
