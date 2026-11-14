# S22-24 · Medir latencia, saturación y atraso con cardinalidad acotada (`D03`, `D13`, `D14`, `D17`, `AUD-02`, `AUD-09`, `AUD-12`, `AUD-17`)

## Trazabilidad y objetivos

- **Spec S22:** historias 16, 17, 20, 61, 62, 68, 69, 72 y 83; decisiones `D03`, `D13`, `D14` y `D17`; hallazgos de auditoría `AUD-02`, `AUD-09`, `AUD-12` y `AUD-17`; escenarios `S22-05`, `S22-09`, `S22-26`, `S22-27` y `S22-28`.
- **Objetivo:** Permitir al responsable operativo conocer en tiempo real si la aplicación responde adecuadamente, qué recurso se satura y cuánto trabajo de publicación o limpieza está atrasado. Se implementa telemetría continua de métricas RED (Rate, Errors, Duration con percentiles p50/p95/p99 mediante histogramas fijos), métricas USE de saturación (espera y errores de pool distinguiendo capacidad local por instancia de capacidad global, memoria y event loop del runtime, permisos externos limitados), métricas de negocio y atraso (acciones, replays, conflictos 409, cuota HCS, incertidumbre y limpieza por categoría), protección estricta contra explosión de cardinalidad mediante vocabularios cerrados, continuidad funcional ante saturación o caída del exportador stderr y reportes versionados (`schemaVersion: 1`) utilizables para alertas automáticas y planificación de capacidad.

---

## 1. Métricas RED y Estimación de Percentiles (`D13`, `D14`, `AUD-09`, `S22-26`)

En [`src/server/metrics.ts`](../src/server/metrics.ts):

1. **Vocabularios cerrados para dimensiones RED:**
   - Rutas plantilla estrictas: [`CLOSED_ROUTES`](../src/server/metrics.ts#L17) (14 rutas parametrizadas canónicas de la aplicación más `"other"`).
   - Métodos permitidos: [`CLOSED_METHODS`](../src/server/metrics.ts#L6) (`GET`, `POST`, `PATCH`, `DELETE`, `"other"`).
   - Clases de status HTTP: [`CLOSED_STATUS_CLASSES`](../src/server/metrics.ts#L9) (`2xx`, `3xx`, `4xx`, `5xx`, `"other"`).
   - Normalizadores deterministas: `normalizeRoute()` detecta y colapsa cualquier segmento dinámico (e.g. `/api/traces/550e8400...` → `/api/traces/:traceId`), impidiendo que rutas no coincidentes o con parámetros multipliquen series.
2. **Histogramas de latencia de tamaño fijo (`DurationHistogram`):**
   - Límite de buckets calibrado con los objetivos D14: `LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 750, 1000, 1500, 2500, 5000, 10000]` ms.
     - 750 ms representa el SLO p95 para API/SQL local caliente.
     - 1500 ms representa el SLO p99 para API/SQL local caliente.
     - 10000 ms representa el presupuesto temporal total de solicitud HTTP.
   - Cálculo de percentiles mediante interpolación lineal de rango sobre buckets acumulativos:
     $$\text{percentile}(p) = L + \frac{\text{rank} - \text{prevCount}}{\text{bucketCount}} \times (U - L)$$
   - Resumen completo: el sistema expone `{ count, sum, avg, min, max, p50, p95, p99 }`, satisfaciendo la exigencia de no informar únicamente el promedio.
3. **Registro en memoria acotado:**
   - La clave de cada serie es `${method}:${route}:${statusClass}`.
   - Con 15 rutas $\times$ 5 métodos $\times$ 5 clases de status, el espacio máximo absoluto de series es de **375 claves**, garantizando memoria $O(1)$ sin importar el volumen de tráfico.

---

## 2. Métricas USE, Saturación y Capacidad Global (`D14`, `D17`, `AUD-12`, `AUD-17`, `S22-28`)

En [`src/server/metrics.ts`](../src/server/metrics.ts):

1. **Modelo y observación del Database Pool:**
   - Capacidad local por instancia: `perInstanceMax: 2`, `perInstanceMin: 0`, `timeoutMs: 3000`, `idleTimeoutMs: 10000`, `statementTimeoutMs: 5000`.
   - Espera en cola de conexiones: medida y agregada en histograma de duración (`pool.waitMs`).
   - Errores y rechazos del pool: contabilización separada de `poolErrors` (`DATABASE_POOL_ERROR`) y `connectionErrors` (`DATABASE_CONNECTION_ERROR`).
   - Distinción explícita de capacidad global (AUD-12, D17):
     $$\text{Límite Global Calculado} = \text{instancias concurrentes (8)} \times \text{pool por instancia (2)} + \text{reserva operativa (4)} = 20\text{ conexiones}$$
     Se documenta la separación entre el límite local de 2 conexiones por contenedor Node.js y el límite backend total de 20 conexiones soportado por el pooler/PostgreSQL gratuito.
2. **Recursos del Runtime Node.js:**
   - Memoria: medición continua de `heapUsed`, `heapTotal`, `rss` y `external` mediante `process.memoryUsage()`.
   - Event Loop Delay: muestreo con `perf_hooks.monitorEventLoopDelay({ resolution: 20 })`, exponiendo `p50`, `p95`, `p99`, `max` y `mean` en milisegundos.
3. **Permisos y bulkheads de capacidad externa (`EXTERNAL_CAPACITY_POLICY`):**
   - Techo global de 2 llamadas costosas simultáneas hacia Hedera (`slots: 2`).
   - Contabilización de permisos adquiridos exitosamente (`acquiredTotal`), rechazos por saturación (`saturationRejections`) y conflictos concurrentes de adquisición (`conflicts`).

---

## 3. Métricas de Negocio, Operación y Atraso (`D03`, `D13`, `D14`, `AUD-02`, `AUD-09`, `S22-05`)

En [`src/server/metrics.ts`](../src/server/metrics.ts), [`src/server/operations/http.ts`](../src/server/operations/http.ts) y [`src/server/hedera/coordinator.ts`](../src/server/hedera/coordinator.ts):

1. **Eventos y acciones operativas:**
   - `actionsCommitted`: incremento en cada mutación de recorrido guardada exitosamente.
   - `replays`: incremento cuando una operación se resuelve de manera idempotente mediante `Idempotency-Key` sin reejecutar el comando.
   - `conflicts`: incremento ante respuestas HTTP 409 por `VERSION_CONFLICT` o `STATE_CONFLICT`.
   - `uncertainTransactions`: incremento ante publicaciones en estado incierto (`HCS_RESULT_UNKNOWN`).
2. **Cuota HCS y atraso de publicaciones:**
   - Monitoreo de cuota diaria HCS: límite (100), usadas, restantes y timestamp UTC de reinicio.
   - Atraso de la outbox: cantidad de publicaciones pendientes en cola (`pendingCount`) y antigüedad en milisegundos de la publicación pendiente más vieja (`oldestPendingAgeMs`).
3. **Mantenimiento y limpieza por categoría (AUD-02, D03, D14):**
   - Fechas de última ejecución: `lastCompletedAt`, `lastPartialAt` y atraso desde el último cron (`cronLagMs`).
   - Antigüedad física del vencido más viejo (`oldestExpiredAgeMs`).
   - Cumplimiento de objetivo de retención física de 36 h (`withinRetentionTarget`).
   - Desglose de registros eliminados por categoría cerrada: `runs`, `contacts`, `sessions`, `quotas`, `leases`, `rateBuckets`.
   - Identificación de categorías estancadas (`stalledCategories`).

---

## 4. Bounding Estricto de Cardinalidad y Redacción Central (`D05`, `D13`, `AUD-04`, `AUD-09`)

1. **Aislamiento de identificadores de alta cardinalidad:**
   - Ni `requestId`, `spanId`, `telemetryTraceId` ni el `businessTraceId` de Jopói son utilizados como dimensiones de métricas.
   - Direcciones de correo electrónico, tokens de sesión, códigos de autorización, cookies y URLs con parámetros de búsqueda son filtrados antes de la agregación.
2. **Prueba de estrés de cardinalidad:**
   - En `tests/observability/metrics.test.ts`, la inyección de 1.000 solicitudes concurrentes con UUIDs y correos únicos confirma que el número total de series registradas se mantiene acotado ($\le 10$ series activas para las rutas evaluadas), sin incrementar la memoria con cada nuevo visitante.
3. **Redacción en exportación:**
   - La serialización JSON del reporte de métricas excluye cualquier valor dinámico o secreto sensible.

---

## 5. Reporte Versionado y Resiliencia del Exportador (`D13`, `D14`, `AUD-09`, `S22-26`)

1. **Estructura del reporte versionado (`MetricsReport`):**
   - `schemaVersion: 1`: esquema estable para consumo programático por sondas de salud (Ticket 25) y ensayos de capacidad (Ticket 28).
   - CLI administrativo: [`scripts/metrics-report.ts`](../scripts/metrics-report.ts) accesible vía `npm run metrics:report` con soporte para `--help` y `--env-file`.
   - Indicadores SLO automáticos contrastados con D14:
     - **Disponibilidad:** $99.5\,\%$ de solicitudes elegibles sin error 5xx (`errorRate <= 0.005`).
     - **Latencia caliente local:** $p95 \le 750\,\text{ms}$ y $p99 \le 1500\,\text{ms}$.
     - **Mantenimiento y retención:** atraso del cron $\le 36\,\text{h}$ y eliminación física $\le 36\,\text{h}$.
2. **Continuidad operativa ante falla del colector:**
   - Si `process.stderr` se destruye, entra en backpressure o se cierra su pipe, la exportación de diagnósticos incrementa `droppedDiagnostics` y descarta la salida sin bloquear las mutaciones ni acumular buffers ilimitados en memoria.
   - El subsistema de métricas en memoria continúa funcionando con normalidad y los reportes versionados reflejan el estado real del sistema.

---

## 6. Verificación Local y Evidencia

1. **Observabilidad y métricas (`tests/observability/metrics.test.ts` y `diagnostics.test.ts`):**
   - 11 pruebas aprobadas en 4.5 segundos:
     - `S22-26`: RED expone rate, errors e histogramas con p50/p95/p99 por vocabularios cerrados (no solo promedio).
     - `S22-26/D17`: USE observa pool (instancia vs global), memoria/event loop y permisos externos.
     - `S22-26/AUD-09`: Negocio mide acciones, replays, conflictos, cuota HCS, incertidumbre y atraso.
     - `S22-26/D13`: Cardinalidad estrictamente acotada: 1000 UUIDs y correos dinámicos no multiplican labels.
     - `S22-26/D14`: Continuidad ante falla del colector/exporter y cálculo de SLOs en reporte versionado.
2. **Integración con base de datos real (`tests/api/diagnosticos.test.ts`):**
   - 4 escenarios aprobados en 134.7 segundos: persistencia outbox, rastreo de ciclo de vida y recuperación histórica sin trazas sintéticas.
3. **Pruebas de CLI y comandos administrativos (`tests/cli/entrega.test.ts`, `tests/cli/seguridad.test.ts`):**
   - 24 pruebas aprobadas en 38 segundos con inclusión de `metrics-report` en la suite de ayuda administrativa.
4. **Seguridad y auditoría (`tests/security/dependencies.test.mjs`, `tests/security/audit-gate.test.mjs`):**
   - 7 pruebas aprobadas en 6.4 segundos.
5. **Calidad y perfil estricto:**
   - `npm run test:quality`: 9/9 pruebas aprobadas demostrando la efectividad de las puertas ante código inválido.
   - `npm run test:contracts`: 28/28 pruebas aprobadas.
   - `npm run test:domain`: 54/54 pruebas aprobadas.
   - `npm run typecheck`, `npm run typecheck:strict`, `npm run typecheck:api`: 0 errores de tipado estricto.
   - `npm run lint`: 237 archivos comprobados con 0 errores.
   - `npm run build`: compilación de producción con Turbopack exitosa.
