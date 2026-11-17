---
name: api-engineering-python-ts
description: Diseñar, implementar, revisar y operar APIs en TypeScript (Next.js Route Handlers, Fastify, Hono, NestJS) y Python — elección de estilo, contratos OpenAPI, semántica HTTP, concurrencia optimista, Idempotency-Key atómica, autorización BOLA/BFLA/BOPLA, límites de body en streaming y rate limiting con Retry-After, timeouts/reintentos con jitter, Transactional Outbox, jobs/cron con leases y observabilidad.
---

# Ingeniería de APIs en Python y TypeScript — SKL-API-001 v2.0

Baseline: Python 3.13+ (FastAPI + Pydantic v2) · Node.js 24/26 LTS (Fastify 5, Hono, NestJS 11, Express 5; Next.js 16 para BFF) · TypeScript strict · OpenAPI 3.1 · OpenTelemetry. Skills relacionadas: `webhooks-python-ts`, `prisma-orm-persistence`, `postgresql-engineering`, `critical-path-testing`, `docker-production-containers`, `cicd-github-actions`.

Prioridades: Correctitud → Seguridad → Contrato → Resiliencia → Observabilidad → Rendimiento → Simplicidad.

## 0. Modo de trabajo

### 0.1 Contexto a determinar
`CONSUMIDORES=` · `ESTILO=` · `STACK=` · `AUTH=` · `TENANCY=` · `DATOS=` · `DESPLIEGUE=` · `SLO=`

### 0.2 Formato de entrega
Contrato + implementación + tests; por endpoint: método/estados, authz, límites, timeout, reintentabilidad, idempotencia, caché y consistencia; ADR corto para patrones condicionales.

### 0.3 Reglas duras (MUST)
- Contrato versionado y verificado en CI (lint + breaking changes + contrato vs implementación).
- Métodos con su semántica (`GET` seguro; `PUT`/`DELETE` idempotentes; `POST` no idempotente salvo clave); nunca `200` con `"success": false`.
- Errores con formato estable (`application/problem+json` RFC 9457 o catálogo tipado del contrato) y `code`/`requestId`; sin stack traces, SQL ni rutas internas.
- Autorización por objeto, propiedad y tenant en cada operación; tenant desde el contexto autenticado, nunca desde el body.
- Entrada validada en runtime con allowlist (`z.strictObject` / `extra="forbid"`); salida por DTO explícito.
- Límites en todo: tamaño de body (streaming acotado), `limit` máximo, profundidad de consultas, concurrencia y rate limit (`429` + `Retry-After`).
- Toda llamada remota con timeout derivado del presupuesto de latencia; reintentos solo en fallos transitorios, acotados, con backoff + jitter y nunca sobre escrituras sin idempotencia.
- `POST` con efectos de negocio reintentables → clave de idempotencia (`Idempotency-Key` / `requestId`) con almacenamiento compartido y atómico.
- Escritura en DB + evento → outbox en la misma transacción; consumidores idempotentes.
- No bloquear el event loop; CPU pesada a workers o colas.
- Logs estructurados con `trace_id`/`request_id`, sin secretos ni PII innecesaria; métricas RED por plantilla de ruta.

## 1. Elección de estilo

REST/HTTP + JSON como default para APIs públicas, BFF y caché HTTP; GraphQL solo cuando el ahorro de round trips justifique DataLoader y gobierno de costos; gRPC interno servicio-a-servicio; SSE para servidor → cliente en vivo; WebSocket solo para tráfico bidireccional de baja latencia; webhooks para notificar eventos externos.

## 2. Contrato y gobierno

Diseño → revisión → implementación → verificación en CI (`spectral lint`, `oasdiff breaking`, `schemathesis`). IDs opacos, fechas RFC 3339 en UTC, dinero/magnitudes exactas como string decimal o unidades menores enteras (nunca `float`). Deprecación con headers `Deprecation` (RFC 9745) y `Sunset` (RFC 8594).

## 3. Semántica HTTP y errores

Códigos precisos: `201` + `Location`, `202` + operación asíncrona, `204`, `304`, `400`, `401`, `403`, `404` (sin revelar existencia de otro tenant/sesión), `409` (conflicto de negocio/idempotencia), `412`/`428` (ETag/`If-Match`), `422`, `429 + Retry-After`, `500`, `502`/`503 + Retry-After`/`504`.

## 4. Seguridad (OWASP API Top 10)

- **AuthN:** OIDC/OAuth 2 con validación de `iss`, `aud`, `exp`/`nbf` y allowlist de algoritmos (`jose`), o sesión en cookie `HttpOnly`/`Secure`/`SameSite` para BFF con CSRF.
- **BOLA (API1):** Filtrar dueño/tenant siempre en la query SQL, no después en memoria; devolver `404`.
- **BFLA (API5):** Permiso explícito por operación.
- **BOPLA (API3):** `z.strictObject()` / `extra="forbid"` en entrada y DTO explícito en salida.
- **API4/API6:** Streaming body limit real, rate limit distribuido (`429 + Retry-After`).
- **SSRF (API7/API10):** Allowlist `https`, bloqueo de rangos privados/metadata tras resolver DNS, validación con esquema de respuestas externas.

## 5. Recursos: paginación, concurrencia y caché

- Paginación por cursor opaco ligado al orden total `(created_at, id)` y filtros (`limit + 1`).
- Concurrencia optimista por `version` / `ETag` (`UPDATE ... WHERE version = :v`).
- `Cache-Control` explícito (`private, no-store` para datos privados de sesión).

## 6. Idempotencia y operaciones asíncronas

- Clave de idempotencia única por ámbito `(actor/tenant, operación, key)` reservada atómicamente en DB (`INSERT ... ON CONFLICT DO NOTHING` / `UniqueConstraint`). Misma huella → replay; en curso → `409 + Retry-After`; otra huella → `409`/`422`.
- Async Request-Reply (`202` + `Location` + `Retry-After`).
- **Outbox e Inbox:** Guardar el evento en la misma transacción ACID que el cambio de negocio; publicador asíncrono con leases (`locked_until`) y reconciliación idempotente. Documentar "al menos una vez + idempotencia del efecto".

## 7. Runtime: async, concurrencia y CPU

Nada síncrono pesado en handlers Node; concurrencia acotada (`p-limit`), streams con `pipeline`, timeouts alineados con LB (`keepAliveTimeout > LB idle timeout`), graceful shutdown con drenaje y `/live` + `/ready` separados.

## 8. Dependencias remotas: timeouts, reintentos y breakers

Presupuesto de latencia propagado (`AbortSignal.timeout`), reintentos solo en `429`/`502`/`503`/`504` o errores de red transitorios sobre operaciones idempotentes con full jitter y respeto de `Retry-After`. Circuit breaker + bulkhead para dependencias inestables; fail closed en autorización.

## 9. Jobs y cron

Idempotentes por diseño, sin solapamiento mediante lock/lease con TTL en DB/Redis, endpoint de cron autenticado por secreto independiente o identidad de plataforma, trabajo en lotes acotados y zona horaria UTC explícita.

## 10. Next.js como API

Route Handlers en runtime Node (no edge) cuando hay DB o SDKs pesados; Server Actions validando auth, autorización y Zod en cada una; mismas reglas de límites, rate limit e idempotencia.

## 11. Observabilidad

OpenTelemetry (`traceparent`), logs JSON redactados con `requestId`/`traceId`, métricas RED por plantilla de ruta (sin IDs en etiquetas para evitar alta cardinalidad), SLOs y runbooks.

## 12. Testing

Unitarios de dominio, integración contra DB real, tests negativos de seguridad (BOLA/BFLA/BOPLA), concurrencia (`Promise.all` con misma clave de idempotencia o versión), resiliencia ante fallos entre commit SQL y publicación externa, y carga.

## 13. Estructura y código

Núcleo funcional (dominio puro) + cáscara imperativa en bordes (`http` → `application` → `domain` → `infrastructure`), guard clauses y docstrings de contrato.

## 14. Antipatrones

Siempre `200`/`500` · `GET` con efectos · errores con stack trace/SQL · BOLA "porque es UUID" · entrada sin `strictObject` · rate limit solo por IP · fetch sin timeout · reintentos de `POST` sin clave · idempotencia en `Map` en memoria · `UPDATE + publish` sin outbox · `cron` solapado · métricas de alta cardinalidad.

## 15. Definition of Done

Contrato validado, BOLA/BFLA/BOPLA probados, límites de body y rate limit activos, idempotencia y concurrencia optimista con tests concurrentes, outbox transaccional, timeouts/jitter, graceful shutdown, observabilidad redactada y load test.

## 16. Niveles

Profesional (semántica, validación, auth básica) → Senior (contrato, BOLA/BOPLA, concurrencia/idempotencia, outbox, resiliencia, trazas) → Staff (gobierno multi-equipo, SLOs, plataforma compartida).

## 17. Referencias

RFC 9110, 9111, 9457, 9745, 8594, 6585, 9700, 8725; OWASP API Security Top 10; AWS Builders' Library (timeouts, retries, jitter); Transactional Outbox.

---

## 18. Aplicación en Jopói

- **Frontera HTTP, streaming acotado y CSRF:** [`src/server/http.ts`](../../../src/server/http.ts) (`requireBrowserMutation`, `readJsonBody` con corte de stream a `maxBytes`, `apiBoundary`, `PRIVATE_RESPONSE_HEADERS`).
- **Catálogo de errores y trazabilidad:** [`src/shared/api-errors.ts`](../../../src/shared/api-errors.ts) y [`src/server/api-errors.ts`](../../../src/server/api-errors.ts) (`requestId` generado en servidor, sin filtrar excepciones ni SQL).
- **Rate limiting compartido en SQL:** [`src/server/security/rate-limit.ts`](../../../src/server/security/rate-limit.ts) (ventanas UTC, reserva global + visitante y `429 + Retry-After`).
- **Idempotencia, concurrencia optimista y Transactional Outbox hacia HCS:** [`src/server/operations/`](../../../src/server/operations), [`src/server/events/`](../../../src/server/events), [`src/server/hedera/`](../../../src/server/hedera) y [`src/app/api/cron/`](../../../src/app/api/cron).
- **Documentación integrada:** [`docs/arquitectura-seguridad-y-apis.md`](../../../docs/arquitectura-seguridad-y-apis.md) y [`docs/s21-validacion.md`](../../../docs/s21-validacion.md).
