---
trigger: glob
globs: "**/src/server/**/*.ts, **/src/app/api/**/*.ts"
description: "Reglas de sesiones anónimas, aislamiento, idempotencia, rate limiting y seguridad de API (S04, S08, S11, S21)."
---

# Reglas de Servidor, API y Seguridad (S04, S08, S11, S21)

- **Aislamiento de módulo:** Todo archivo en `src/server/` debe importar `"server-only"` o mantenerse fuera del grafo de cliente.
- **Sesiones (S04/S21):**
  - Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, y `Secure` en orígenes HTTPS.
  - El servidor almacena únicamente el hash SHA-256 del token (`tokenHash`), nunca el token en claro.
  - Una sesión dura 24 horas y permite hasta 3 recorridos (`DemoRun`), incluido el inicial. Reiniciar consume un recorrido y no extiende el vencimiento de la sesión.
- **Autorización e Idempotencia (S08):**
  - Una sesión solo puede leer o mutar sus propios `DemoRun`.
  - Toda mutación valida primero el payload con Zod (`src/shared/`) y utiliza los recibos transaccionales (`SessionIntentReceipt`, `OperationCommandReceipt`) para evitar duplicados por doble clic o reintentos.
- **Protección CSRF multicapa (`requireBrowserMutation`):** Toda mutación de navegador exige `Sec-Fetch-Site` (`same-origin` o `none` cuando el navegador lo envía), `Origin` idéntico a `APP_URL`, header `X-Jopoi-Request: demo` y `Content-Type: application/json`. Ver detalles de AuthN/AuthZ y APIs en `@docs/arquitectura-seguridad-y-apis.md`.
- **Trazabilidad pública (S11):**
  - Los endpoints públicos de trazabilidad son estrictamente de lectura (sin cookies de sesión requeridas) y jamás exponen `sessionId`, `tokenHash`, contactos ni credenciales.
- **Secretos:** Ninguna variable de `.env.example` puede exponerse al cliente ni llevar prefijo `NEXT_PUBLIC_`.
- **Runtime Node.js y Asincronía (`node-backend-engineering`):**
  - Prohibido usar APIs bloqueantes `*Sync` (`fs.*Sync`, `crypto.*Sync`, `execSync`) o regex con backtracking catastrófico en el camino de una request HTTP.
  - Toda llamada saliente (ej. `mirrorJson` hacia Hedera mirror node) debe llevar `AbortSignal.timeout()`, `redirect: "error"` y lectura del body por streaming acotada a `maxBytes`.
  - Ejecutar subprocesos en CLI/scripts con `spawn(..., { shell: false })` y validar rutas relativas con `resolve` + `startsWith(ROOT + sep)`.
- **Endurecimiento HTTP, Next.js 16 y trazabilidad (`api-engineering-python-ts`, `better-auth-security-best-practices`):**
  - `apiBoundary()` en `src/server/http.ts` garantiza `X-Request-Id` (si no fue definido) y `X-Content-Type-Options: nosniff` tanto en respuestas exitosas (incluyendo rutas públicas/cron) como en respuestas de error correlacionadas con `error.requestId`.
  - `next.config.ts` mantiene `poweredByHeader: false`, cabeceras defensivas en `/:path*` (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`) y `X-Robots-Tag: noindex, nofollow` en `/api/:path*`.
  - Todos los Route Handlers bajo `src/app/api/**/route.ts` declaran `export const runtime = "nodejs"` y `export const dynamic = "force-dynamic"`.
  - Las pautas de `better-auth-security-best-practices` aplican a nivel conceptual (entropía de secretos ≥32 bytes, CSRF con `Origin` + `Sec-Fetch-Site`, cabeceras defensivas globales y rate limiting en PostgreSQL) sobre el esquema propio de sesiones HMAC (`S03`/`S04`/`S21`); no instalar `better-auth`, no usar Redis/tiendas externas, no confiar en `x-forwarded-for` genérico ni introducir renovación deslizante o comodines en orígenes confiables.
