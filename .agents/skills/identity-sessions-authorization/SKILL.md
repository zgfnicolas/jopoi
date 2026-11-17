---
name: identity-sessions-authorization
description: Diseñar, implementar y revisar autenticación, sesiones y autorización en TypeScript (Next.js, Fastify, Express, NestJS) y Python — elección de arquitectura (sesión opaca, BFF, OIDC, JWT), NIST 800-63B-4 y Argon2id, Passkeys/MFA, ciclo de vida de sesiones, CSRF con Fetch Metadata + Origin, OAuth 2/OIDC (RFC 9700), refresh tokens con rotación y detección de reúso, y autorización anti-BOLA/BFLA/BOPLA con tests de abuso.
---

# Identidad, sesiones y autorización — SKL-WEB-SEC-001 v2.0

Referencias: OWASP Top 10:2025 (A01 Broken Access Control, A07 Authentication Failures), ASVS 5.0, NIST SP 800-63B-4, RFC 9700 (OAuth 2.0 Security BCP), RFC 9207, RFC 9449, WebAuthn L3. Skills relacionadas: `web-security-baseline-python-ts`, `api-engineering-python-ts`.

Prioridades: Seguridad → Correctitud → Menor privilegio → Revocabilidad → Auditabilidad → UX → Rendimiento.

## 0. Modo de trabajo

### 0.1 Contexto a determinar
- `CLIENTES=` (web SSR · SPA propia · app móvil · terceros · servicios)
- `IDENTIDAD=` (IdP gestionado · librería · propia)
- `DOMINIOS=` (`app.example.com`, `api.example.com`: ¿mismo site?)
- `RIESGO=` (bajo · datos personales · dinero · admin)
- `MODELO_AUTHZ=` (roles simples · atributos · relaciones/multi-tenant)

### 0.2 Formato de entrega
Diagrama corto del flujo (quién emite, dónde vive la credencial, cómo se revoca) + código en el framework detectado + tests de abuso (`fixation`, `CSRF`, `BOLA`, `replay` de refresh, enumeración) + tabla por credencial (almacenamiento, TTL, rotación, revocación, impacto de robo).

### 0.3 Reglas duras (MUST)
- Autenticación y autorización server-side en cada request; la UI solo refleja permisos.
- Rutas privadas por defecto; las públicas se declaran y un test lo verifica.
- Sesiones de navegador: ID opaco de ≥ 128 bits (CSPRNG), en cookie `__Host-`, `Secure`, `HttpOnly`, `SameSite`; hash del ID en el store; regeneración en login y cambios de privilegio; timeout de inactividad + absoluto server-side; logout que destruye en el servidor.
- Credenciales nunca en `localStorage`/`sessionStorage` ni accesibles al JS (BFF para SPAs).
- Mutaciones autenticadas por cookie con protección CSRF (Fetch Metadata + `Origin`, y/o token).
- Contraseñas: Argon2id + política NIST 800-63B-4 + lista de bloqueo de contraseñas comprometidas.
- OAuth/OIDC: Authorization Code + PKCE S256, `state`, `nonce`, redirect URI exacto; sin Implicit ni Password grant.
- Refresh tokens con rotación y detección de reutilización (o sender-constrained).
- Autorización por objeto, acción y tenant, con filtrado en la query para listados; `404` para recursos ajenos.
- Fail closed ante errores del store de sesiones, del IdP o del motor de políticas.

## 1. Elegir la arquitectura

| Caso | Recomendado | Credencial en el cliente |
| :--- | :--- | :--- |
| Web SSR / Next.js / Django first-party | Sesión opaca server-side (store en Redis/DB) | Cookie `__Host-session` |
| SPA propia (React/Vite) | BFF: el backend hace OIDC y guarda los tokens | Cookie de sesión del BFF |
| App móvil | OIDC + PKCE con navegador del sistema; Keychain/Keystore | Access token corto + refresh rotado |
| APIs para varios clientes/servicios | OAuth 2 con JWT de acceso (audiencia, scopes, vida corta) | Bearer en header |
| Servicio a servicio | `private_key_jwt`/mTLS, workload identity | — |

JWT es un formato, no una arquitectura de sesión: para una web propia, una sesión opaca revocable es más simple y segura. Cookies firmadas/cifradas stateless no se pueden revocar antes de su vencimiento.

## 2. Contraseñas (NIST SP 800-63B-4)

- Longitud mínima: 15 caracteres si es factor único; 8 si siempre va con MFA; aceptar ≥ 64 caracteres sin truncar; sin reglas arbitrarias de composición ni caducidad por calendario.
- Chequeo de filtradas mediante k-anonymity (primeros 5 caracteres de SHA-1 a Have I Been Pwned range API, sin enviar nunca la contraseña).
- Hashing con Argon2id (`m = 19 MiB`, `t = 2`, `p = 1` mínimo) + rehash automático.
- Login con mensaje único y tiempo homogéneo, rate limiting progresivo y notificación por dispositivo nuevo.

## 3. Passkeys y MFA

- Passkeys (WebAuthn) como método principal/obligatorio para administradores (`@simplewebauthn/server`), verificando `origin`, `rpID`, challenge de un solo uso y contador contra clonación.
- TOTP (`otplib`) sin reuso del mismo paso; 8–10 códigos de recuperación hasheados de un solo uso; evitar SMS como único factor.
- Step-up (< 10 min o factor adicional) para cambios de email/contraseña/MFA, códigos, API keys, pagos y elevación de privilegios.

## 4. Sesiones

- Generar ≥ 256 bits con `randomBytes(32).toString("base64url")`; guardar en DB/Redis solo el hash (`SHA-256` o `HMAC-SHA256`), nunca el ID crudo.
- Cookie `__Host-session=<rawId>; Path=/; Secure; HttpOnly; SameSite=Lax` (sin `Domain`, `Max-Age` ≤ absoluto).
- Validar timeout de inactividad y absoluto server-side; `permissionVersion` para invalidación inmediata ante cambio de rol/estado.
- Regenerar ID en login, cambio de privilegio y step-up (`session fixation`); `destroyAllSessions()` al cambiar contraseña; fail closed si el store falla.
- **Trampa Next.js:** Leer y validar la sesión en la capa de datos (`server-only`), no solo en middleware; verificar `Origin` + Fetch Metadata en Route Handlers.

## 5. CSRF

```typescript
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteMutation(method: string, headers: Headers, allowedOrigins: Set<string>): boolean {
  if (SAFE.has(method)) return false;
  const site = headers.get("sec-fetch-site");
  if (site) return !(site === "same-origin" || site === "none");
  const origin = headers.get("origin");
  if (origin) return !allowedOrigins.has(origin);
  return true;
}
```

Capas: Fetch Metadata (`Sec-Fetch-Site`) + `Origin` + `SameSite=Lax|Strict` + nunca mutar estado con `GET`. CORS no protege contra CSRF.

## 6. OAuth 2 y OpenID Connect (RFC 9700)

- Authorization Code + PKCE S256 + `state` + `nonce` + validación de `iss` (RFC 9207) y redirect URI exacto.
- Identidad por `(iss, sub)`, nunca por email sin verificar. Sin Implicit ni Password grant.
- **Refresh tokens con rotación y detección de reutilización:** Tabla `refresh_tokens` con `family_id`, `parent_id`, `token_hash`, `used_at`, `revoked_at`, `expires_at` (vida absoluta de la familia). Si `used_at` ya existía, revocar toda la familia y alertar.
- Validación de JWT en APIs con allowlist de algoritmos (`RS256`, `ES256`), `iss`, `aud`, `exp`/`nbf`, `typ` y JWKS rotado (`jose`).

## 7. Ciclo de vida de la cuenta

Tokens de reset ≥ 128 bits hasheados de un solo uso (15–60 min), enlaces con dominio propio fijo (nunca header `Host`), step-up para cambios de email/MFA/eliminación, rate limiting estricto por destino y origen.

## 8. Autorización

- Capa de políticas puras por recurso, acción y tenant (`authorize()` devuelve `404` para recursos ajenos).
- Listados filtrados siempre en la query SQL (`WHERE tenant_id = ...`), nunca en memoria tras traer todo.
- Rutas privadas por defecto verificadas mediante test automatizado.

## 9. Tests de abuso obligatorios

Probar: session fixation, timeouts idle/absoluto, logout server-side, revocación al cambiar contraseña, CSRF (`Sec-Fetch-Site: cross-site` / `Origin` ajeno → `403`), enumeración, fuerza bruta, replay de refresh token, OIDC (`state`/`nonce`/`iss`), BOLA/BFLA (`404`/`403`), escalada de privilegios, replay de TOTP y challenge de passkey.

## 10. Logging y alertas de identidad

Registrar `login.*`, `mfa.*`, `passkey.*`, `session.*`, `refresh_token.reuse`, `authz.denied`, `role.changed` con IP, user agent, `requestId` y motivo; jamás loguear contraseñas, tokens, IDs completos de sesión ni secretos MFA.

## 11. Antipatrones

JWT por defecto para sesiones web · tokens en `localStorage` · cookies sin `HttpOnly`/`Secure`/`SameSite` · ID crudo en el store · `MemoryStore` en prod · no regenerar al loguearse · autorización solo en middleware/UI · `403` que revela existencia · filtrar listados en memoria · UUID como autorización · refresh tokens eternos · CSRF confiado solo a `SameSite` o CORS · Route Handlers sin chequeo de origen/Fetch Metadata · fail open ante fallo del store/IdP.

## 12. Definition of Done

Arquitectura elegida y justificada; ID ≥ 128 bits hasheado en store con timeouts e invalidación; CSRF con Fetch Metadata + `Origin` en toda mutación por cookie; BOLA/BFLA cubiertos en query (`404` ajeno); tests de abuso y alertas activos.

## 13. Referencias

OWASP Top 10:2025, ASVS 5.0 (V6–V8, V10), NIST SP 800-63B-4, RFC 9700, RFC 9207, RFC 9449, RFC 9068, RFC 6265bis, W3C WebAuthn L3, MDN Fetch Metadata.

---

## 14. Aplicación en Jopói

- **Sesión opaca actual (prototipo personal):** [`src/server/sessions/credentials.ts`](../../../src/server/sessions/credentials.ts) genera tokens de 256 bits (`randomBytes(32)`) y guarda únicamente su `HMAC-SHA256` (`sessionTokenHash`) en `DemoSession`; [`src/server/sessions/http.ts`](../../../src/server/sessions/http.ts) emite cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, `Path=/`.
- **Anti-BOLA e idempotencia:** [`src/server/sessions/service.ts`](../../../src/server/sessions/service.ts) filtra `requireOwnedRun()` por `{ traceId, sessionId, expiresAt }` en la transacción SQL devolviendo `404 NOT_FOUND` ante recursos ajenos.
- **Defensa CSRF multicapa:** [`src/server/http.ts`](../../../src/server/http.ts) (`requireBrowserMutation`) exige `Sec-Fetch-Site` (`same-origin` / `none` cuando está presente), `Origin === APP_URL`, `X-Jopoi-Request: demo` y `Content-Type: application/json`.
- **Evolución comercial (Access + Refresh Tokens):** Documentada en [`docs/arquitectura-seguridad-y-apis.md`](../../../docs/arquitectura-seguridad-y-apis.md) y [`docs/s21-validacion.md`](../../../docs/s21-validacion.md).
