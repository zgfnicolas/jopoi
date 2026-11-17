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
