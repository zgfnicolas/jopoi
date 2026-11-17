# Arquitectura de Seguridad, Supply Chain, AuthN/AuthZ y APIs

Este documento consolida las prácticas de configuración multi-entorno (`SKL-JS-CONFIG-001`), identidad/sesiones/autorización (`SKL-WEB-SEC-001`) e ingeniería de APIs (`SKL-API-001`) aplicadas en **Jopói** y su hoja de ruta para una evolución comercial.

---

## 1. Configuración de Dependencias, Supply Chain y Multi-Entorno

### 1.1 Perfiles de entorno aislados

| Entorno | Fuente de variables | Base de datos | Red Hedera | Política TLS y origen |
| --- | --- | --- | --- | --- |
| **Desarrollo (`local`)** | `.env.local` (ignorado por Git) | PostgreSQL local | Testnet opcional | Loopback sin TLS permitido; `APP_URL` por defecto `http://127.0.0.1:3000`. |
| **Pruebas (`test`)** | Entorno efímero en memoria por arnés (`tests/support/`) | Clúster PostgreSQL aislado por corrida | Proveedor HCS/reloj controlado en API; real solo en `acceptance:live` | Loopback local; pruebas HTTPS dedicadas (`s21:https`) verifican cookies `Secure`. |
| **Pre-entrega (`candidate`)** | Archivo explícito pasado por `--env-file` o `--vercel-env-file` | Neon Free (`-pooler` para app y directo para migraciones) | Testnet obligatorio (`HEDERA_OPERATOR_ID`, `HEDERA_TOPIC_ID`) | Obligatorio `sslmode=require\|verify-ca\|verify-full` (`verify-full` en migraciones) y `APP_URL` HTTPS. |
| **Producción (`production`)** | Variables gestionadas en Vercel + integración nativa Neon | Neon Free vía Vercel Marketplace (`DATABASE_URL` + `DATABASE_URL_UNPOOLED`) | Testnet firmado en servidor | TLS estricto, cookie `Secure`, `NODE_ENV=production`. |

### 1.2 Lectura por capacidades y separación Build-Time vs Runtime

- **Lector modular con Zod 4 (`src/server/config/environment.ts`):** Importar `src/server/config/index.ts` nunca lee `process.env` ni exige todas las variables en tiempo de build. Cada flujo pide solo la capacidad necesaria (`database()`, `migrations()`, `session()`, `maintenance()`, `origin()`, `hedera()`). Ante ausencia o formato inválido se devuelven únicamente `{ variable, reason }`, sin exponer valores ni el `ZodError` original.
- **Cero variables `NEXT_PUBLIC_`:** Ninguna variable de `.env.example` o `.env.candidate.example` lleva prefijo `NEXT_PUBLIC_`. Esto evita hornear secretos o endpoints específicos de entorno en el bundle cliente (`build once, deploy many`).

### 1.3 Endurecimiento de `npm` y CI

- **Runtime LTS fijado:** `.node-version` (`24.22.1`) junto con `engines.node` y `devEngines` en `package.json` (`>=24.0.0 <27`, compatible con Node 24 Maintenance LTS y Node 26 Active LTS). `src/server/delivery/preflight.ts` valida que runtime y lockfile estén sincronizados.
- **Política `.npmrc`:** `save-exact=true`, `engine-strict=true`, `strict-peer-deps=true`, `min-release-age=3` (cooldown de 3 días ante paquetes recién publicados), `fund=false`.
- **Allowlist de scripts (`allowScripts`):** Solo `prisma`, `@prisma/engines` y `playwright` están autorizados en `package.json`; el resto queda bloqueado por defecto.
- **Pipeline en GitHub Actions (`.github/workflows/ci.yml`) y Dependabot (`.github/dependabot.yml`):** Permisos `contents: read`, acciones fijadas por SHA, `npm ci`, `npm audit signatures`, `db:generate`/`db:validate`, `typecheck`, `test:ui:tokens`, `test:cli`, `delivery:check` y `npm audit --omit=dev --audit-level=high`. Dependabot usa un cooldown de 3 días en parches/menores y 14 días en majors.

---

## 2. Políticas de AuthN, AuthZ y Evolución hacia Access / Refresh Tokens

### 2.1 Sesión opaca actual (Prototipo personal)

```mermaid
sequenceDiagram
  autonumber
  participant B as Navegador
  participant API as Route Handler (Next.js)
  participant DB as PostgreSQL (DemoSession / DemoRun)

  B->>API: POST /api/demo/session (Sec-Fetch-Site + Origin + X-Jopoi-Request)
  API->>API: randomBytes(32) -> token opaco (256 bits)
  API->>DB: Guarda tokenHash = HMAC-SHA256(SESSION_SECRET, token)
  API-->>B: 201 Created + Set-Cookie: jopoi_session (HttpOnly, SameSite=Lax, Secure en prod, 24h)
  B->>API: POST /api/demo/runs/{traceId}/commands (Cookie + expectedVersion + requestId)
  API->>DB: requireOwnedRun() filtra por { traceId, sessionId, expiresAt > now }
  alt Sesión inválida o recurso ajeno
    DB-->>API: null
    API-->>B: 404 NOT_FOUND (no revela existencia)
  else Propietario válido
    DB-->>API: Actualiza con bloqueo optimista y guarda OperationEvent + HcsPublication
    API-->>B: 200 OK (Cache-Control: private, no-store; Vary: Cookie)
  end
```

- **Por qué no se usan JWT ni Access/Refresh Tokens en el prototipo:** Como señala `SKL-WEB-SEC-001` y confirma `docs/s21-validacion.md`, para un frontend propio en Next.js con identidad anónima de 24 h y cuota estricta de 3 recorridos en SQL, una **sesión opaca server-side** es más simple, permite revocación inmediata (por expiración o rotación de `SESSION_SECRET`) y elimina el riesgo de tokens accesibles desde JavaScript (`localStorage`/`sessionStorage`).
- **Almacenamiento seguro del identificador:** `src/server/sessions/credentials.ts` genera 256 bits de entropía (`base64url`) y persiste únicamente `HMAC-SHA256(SESSION_SECRET, token)` en `DemoSession.tokenHash`.
- **Defensa CSRF multicapa (`src/server/http.ts` -> `requireBrowserMutation`):**
  1. **Fetch Metadata (`Sec-Fetch-Site`):** si el navegador envía el encabezado y es distinto de `"same-origin"` o `"none"` (por ejemplo `"cross-site"` o `"same-site"`), se rechaza con `403 REQUEST_FORBIDDEN`.
  2. **Validación estricta de `Origin`:** debe coincidir exactamente con `APP_URL` configurado en servidor (jamás se confía en `Host` o `X-Forwarded-Host`).
  3. **Header personalizado y tipo de contenido:** exige `X-Jopoi-Request: demo` y `Content-Type: application/json`.
- **Autorización por objeto y propiedad (anti-BOLA / anti-BOPLA):**
  - `requireOwnedRun()` (`src/server/sessions/service.ts`) siempre filtra en la consulta SQL por `sessionId` y vigencia (`expiresAt > now`). Conocer un `traceId` mediante un QR público jamás autoriza mutaciones ni lecturas privadas; ante recursos ajenos responde `404 NOT_FOUND`.
  - Todos los DTOs de entrada usan `z.strictObject(...)` rechazando propiedades extra no declaradas (`400 INVALID_INPUT`).

### 2.2 Diseño de evolución comercial (Piloto multi-empresa)

Cuando Jopói evolucione de prototipo personal a plataforma comercial con empresas reales:

1. **Portal web (Next.js como BFF):** Mantener **sesión opaca en cookie `__Host-jopoi_session`** autenticada contra un IdP mediante **OIDC (Authorization Code + PKCE S256, `state`, `nonce`, validación de `iss`)**, **Passkeys (WebAuthn)** obligatorias para coordinadores/administradores y regeneración del ID de sesión al autenticar o cambiar privilegios.
2. **App móvil para transportistas / integraciones ERP:** Emitir **Access Tokens JWT de vida corta (5–15 min)** con audiencia (`aud`), emisor (`iss`), `sub`, `tenantId`, scopes mínimos y validación por allowlist de algoritmos (`RS256`/`ES256`, JWKS rotado), acompañados de **Refresh Tokens opacos rotados**:
   - Almacenados en tabla `refresh_tokens` con `token_hash` (SHA-256), `family_id`, `parent_id`, `used_at`, `revoked_at` y `expires_at` absoluto de familia.
   - Si un refresh token ya usado (`used_at !== null`) vuelve a presentarse, se revoca inmediatamente toda la familia (`family_id`) y se emite alerta de compromiso.

---

## 3. Estándares de Ingeniería de APIs en Jopói

| Principio (`SKL-API-001`) | Implementación en Jopói | Módulo responsable |
| --- | --- | --- |
| **Errores deterministas y sin fugas** | Catálogo cerrado `API_ERROR_CATALOG` + `requestId` UUID generado en servidor; nunca expone stack traces, SQL ni mensajes de proveedores. | `src/shared/api-errors.ts`, `src/server/api-errors.ts` |
| **Límites de body en streaming** | `readJsonBody(request, maxBytes)` lee el `ReadableStream` por chunks y cancela el stream al instante si supera `maxBytes` (sin confiar solo en `Content-Length`). | `src/server/http.ts` |
| **Rate limiting compartido y `Retry-After`** | Contadores en PostgreSQL (`RequestRateLimitBucket`) con ventanas UTC fijas (`SESSION`, `CONTACT`, `VERIFICATION`, `TRACE`), reserva global antes de visitante (HMAC de IP) y rechazo `429 RATE_LIMITED` + `Retry-After`. | `src/server/security/rate-limit.ts` |
| **Idempotencia atómica** | Cada `POST` operativo, inicio/reinicio de recorrido, reintento HCS o solicitud de demo exige `requestId` UUID validado en transacción (`SessionRunIntent`, `OperationCommandReceipt`, `DemoRequest`). Misma intención devuelve replay; intención distinta con misma clave devuelve `409 IDEMPOTENCY_CONFLICT`. | `src/server/sessions/service.ts`, `src/server/operations/` |
| **Concurrencia optimista** | Cada comando exige `expectedVersion` y actualiza `DemoRun` atómicamente verificando versión (`409 VERSION_CONFLICT` ante lost updates). | `src/server/operations/` |
| **Transactional Outbox hacia Hedera HCS** | La transacción SQL (`Serializable`) persiste cambio de estado, `OperationEvent` (hash JCS/SHA-256) y `HcsPublication` (`QUEUED`) antes de invocar la red; la publicación usa leases (`leaseUntil`), máx. 3 intentos automáticos + 1 manual y consulta al mirror node ante `UNCERTAIN`. | `src/server/events/`, `src/server/hedera/` |
| **Cron idempotente y sin solapamiento** | `/api/cron` exige `Authorization: Bearer <CRON_SECRET>`, adquiere lease exclusivo en `MaintenanceLease` y procesa pendientes/retención en lotes acotados. | `src/app/api/cron/`, `scripts/maintenance.ts` |
