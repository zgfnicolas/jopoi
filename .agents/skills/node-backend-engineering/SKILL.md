---
name: node-backend-engineering
description: Construir y operar backends Node.js de producción aprovechando correctamente el runtime — Node 24/26 LTS, event loop y worker pool, modelo asíncrono (promesas, async/await, iteradores async), clasificación I/O vs CPU, concurrencia acotada, cancelación con AbortSignal, streams y backpressure, memoria acotada, timeouts HTTP, AsyncLocalStorage, observabilidad (ELU, OTel), graceful shutdown, Permission Model y seguridad del runtime.
---

# Senior Node.js Backend Engineering — SKL-NODE-BACKEND-001 v2.1

Baseline: Node.js 26 LTS (Active LTS desde oct 2026; EOL 30/04/2029) · Node 24 en Maintenance · TypeScript estricto · ESM. Delegaciones: `orm-persistence-js-ts`, `api-engineering-python-ts`, `identity-sessions-authorization`, `js-project-configuration`.

Prioridades: Correctitud → Seguridad → Resiliencia → Observabilidad → Rendimiento → Escalabilidad → Simplicidad.

## 0. Modo de trabajo

Determinar `NODE_VERSION`, `FRAMEWORK`, `WORKLOAD`, `DEPLOY`, `LB_IDLE_TIMEOUT`, `CPU/MEM LIMITS`, `RUN_TS`, `MODULES`, `COMMENTS_LANG`. Entregar clasificación I/O vs CPU, código completo con límites explícitos (concurrencia, cola, memoria, payload, timeouts), métricas y alertas.

### Reglas duras (MUST)
- Nada de CPU pesada ni APIs `*Sync` en el camino de una request; CPU → worker pool.
- Ninguna promesa flotante: toda promesa se espera, se devuelve o se maneja explícitamente.
- Nunca `async` en callbacks que nadie espera (`forEach`, emitters, `setInterval`, Express 4) sin manejo explícito del rechazo.
- Toda colección de promesas que dependa del input, con concurrencia acotada.
- Toda dependencia remota con timeout y cancelación (`AbortSignal`); desconexión del cliente cancela el trabajo caro.
- Todo buffer, caché, cola, `Map`/`Set` o lista de listeners que crezca con el tráfico, con límite y política de expulsión.
- Servidor HTTP con `requestTimeout`/`headersTimeout`, `keepAliveTimeout` > idle del LB, y límites de body.
- Configuración validada antes de aceptar tráfico; el proceso falla en arranque si falta algo.
- `uncaughtException` y `unhandledRejection` terminan el proceso tras loguear; nunca "loguear y seguir".
- `SIGTERM`/`SIGINT` con graceful shutdown y timeout de apagado forzado.
- Contexto por request con `AsyncLocalStorage.run()`; nunca `enterWith()`.
- Event-loop delay, ELU, heap y pool medidos en producción; logs JSON redactados.

## 1. Plataforma (nov 2026)

- **Node 26 LTS** (Active LTS) y **Node 24 LTS** (Maintenance).
- `Temporal` habilitado por defecto en Node 26; `type stripping` estable (`enum` y decoradores requieren build); `using`/`await using`; `Promise.withResolvers`, `Promise.try`, `Array.fromAsync`; Permission Model estable (`--permission`, `--permission-audit`); `node:test`.

## 2. Modelo de ejecución y clasificación

- **I/O-bound:** DB, Redis, HTTP, colas → `async` + pools + timeouts + concurrencia acotada.
- **CPU-bound pesado:** Worker pool (`Piscina` con `maxQueue`), servicio externo o cola durable; nunca bloquear el event loop ni el libuv worker pool (`fs.*Sync`, `crypto.*Sync`, `execSync`, ReDoS, `JSON.parse` de MB).

## 3. Modelo asíncrono

- **Orden:** síncrono → `nextTick` → microtareas (promesas) → fases del event loop (`timers` → `poll` → `check`). Nunca depender en ESM del orden relativo `nextTick` vs promesas.
- **Callbacks:** `node:*/promises`, `util.promisify`, `events.once`/`on`; nunca mezclar callback y promesa ni "liberar a Zalgo".
- **Promesas y `async/await`:** Usar `Promise.all` / `allSettled` / `any` con `AbortController`; evitar `forEach(async ...)` y executor `async` en `new Promise`; siempre `return await` dentro de `try/catch`; usar `catch (e: unknown)` y estrechar tipos.
- **Iteradores async (`AsyncGenerator`):** Streaming natural con backpressure y limpieza garantizada en `finally` aunque el consumidor haga `break`.
- **Lint obligatorio:** `no-floating-promises`, `no-misused-promises`, `await-thenable`, `return-await`, `only-throw-error`, `use-unknown-in-catch-callback-variable`.

## 4. Concurrencia, cancelación y timeouts

- Paralelismo acotado con `mapLimit(items, limit, fn, signal)`.
- Cancelación propagada con `AbortSignal.any([clientSignal, AbortSignal.timeout(...)])`.
- Configurar `undici` `Agent` propio con timeouts explícitos (`connectTimeout`, `headersTimeout`, `bodyTimeout`).

## 5. CPU: worker threads con pool

`Piscina` singleton por proceso con `maxThreads` desde la cuota de CPU del contenedor y `maxQueue` acotado (load shedding `503 + Retry-After` al llenarse).

## 6. Streams y backpressure

Usar siempre `stream/promises.pipeline(source, limitTransform, ..., dest, { signal })` y `for await` para respetar backpressure y cerrar recursos ante error o cancelación. Probar throughput en Node 26 por cambios en lectura de streams.

## 7. Memoria

`LRUCache` con `max` y `ttl` para cachés en memoria; limpiar listeners (`once`); fijar `--max-old-space-size` ≈ 75% del límite del contenedor; evitar closures que retengan requests completos.

## 8. Servidor HTTP

Configurar `bodyLimit`, `requestTimeout`, `headersTimeout`, `keepAliveTimeout` (> idle del LB), `trustProxy` explícito (nunca `true` ciego), `/live` y `/ready` separados.

## 9. Contexto y observabilidad

`AsyncLocalStorage.run()` en hook de request; logger JSON (`pino`) con redacción de credenciales/cookies; métricas de runtime (`monitorEventLoopDelay`, `performance.eventLoopUtilization()`, heap, pool) y OpenTelemetry (`--import ./instrumentation.js`).

## 10. Errores y ciclo de vida del proceso

Distinguir errores operacionales, de dependencia, de programación y fatales. Graceful shutdown: marcar unready → esperar `DRAIN_DELAY_MS` → `app.close()` → cerrar workers/DB/telemetría bajo `SHUTDOWN_TIMEOUT_MS` (`force.unref()`).

## 11. Configuración, seguridad del runtime y supply chain

- Validar `process.env` con Zod al arrancar; Permission Model (`--permission-audit` / `--permission`) como defensa en profundidad.
- **Ejecución de subprocesos:** `spawn(bin, args, { shell: false })` con argumentos validados; nunca `exec` con input.
- **Path traversal:** `resolve(ROOT, relative)` y verificar `full !== ROOT && !full.startsWith(ROOT + sep)`.
- **Prototype pollution:** validar con esquema y usar `Object.create(null)` para mapas de claves externas.

## 12. Jobs, eventos y escalado

`EventEmitter` solo es local/efímero (manejar rechazos con `captureRejections` o `try/catch`); durabilidad entre procesos requiere cola/outbox; procesos stateless escalados por orquestador.

## 13. Testing y medición

Unitarios, HTTP (`inject`/`supertest`), integración (Testcontainers), tests de runtime (abort, timeout, backpressure, shutdown, unhandled rejection) y carga (`k6`/`autocannon`).

## 14. Código y comentarios

Guard clauses, composición por factory/closure, comentarios solo para el "por qué" no obvio.

## 15–19. Antipatrones, DoD, KPIs, Protocolo y Referencias

Cero APIs `*Sync` en request, cero promesas flotantes o `Promise.all` sin cota, cero `keepAliveTimeout` < LB idle, cero `console.log` de secretos, cero `exec`/shell con input, siempre `AbortSignal` y streams con `pipeline`.

---

## 20. Aplicación en Jopói

- **Streams acotados y timeouts de red:**
  - [`src/server/http.ts`](../../../src/server/http.ts) (`readJsonBody`) acota la lectura del `ReadableStream` de request chunk a chunk y cancela (`reader.cancel()`) al superar `maxBytes`.
  - [`src/server/hedera/mirror.ts`](../../../src/server/hedera/mirror.ts) (`mirrorJson`) usa `AbortSignal.timeout(3000)`, `redirect: "error"`, `cache: "no-store"`, lectura acotada por chunks y reviver `context.source` en `JSON.parse` para preservar `uint64` (`sequence_number`) sin perder precisión por `Number`.
- **Subprocesos y rutas seguras en CLI/Scripts:** [`scripts/delivery.ts`](../../../scripts/delivery.ts) y [`scripts/local-postgres.ts`](../../../scripts/local-postgres.ts) ejecutan procesos con `spawn(..., { shell: false, windowsHide: true })` y validan rutas con `resolve()` + `startsWith(ROOT + sep)`.
- **Dependencias de configuración y APIs:** [`src/server/config/environment.ts`](../../../src/server/config/environment.ts) y [`src/server/database/client.ts`](../../../src/server/database/client.ts).
