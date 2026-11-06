# S22-15 · Proteger la sesión HTTPS y sus mutaciones con CSRF (`D07`, `D10`, `AUD-13`)

## Trazabilidad y objetivos

- **Spec S22:** historias 3, 42, 45, 48, 49, 50 y 86; decisiones `D07` y `D10`; hallazgo de auditoría `AUD-13`; escenarios `S22-12`, `S22-16` y `S22-18`.
- **Objetivo:** Blindar la autenticación basada en cookies mediante el prefijo estricto `__Host-` en entornos HTTPS, garantizar migración transparente desde cookies heredadas sin extender el vencimiento (`expiresAt`), rechazar categóricamente la ambigüedad de credenciales concurrentes y proteger todas las mutaciones mediante CSRF token HMAC vinculado a la sesión, validación estricta de `Origin` y `Fetch Metadata` (`Sec-Fetch-Site`, `Sec-Fetch-Mode`).

---

## 1. Política de Cookie y Prefijo `__Host-` (`D07`, `AUD-13`)

En [`src/server/sessions/credentials.ts`](../src/server/sessions/credentials.ts), se define la política de cookies según el protocolo de la solicitud (`sessionCookiePolicy(isHttps)`):

| Parámetro | Entorno HTTPS | Entorno HTTP Local (Desarrollo) |
| --- | --- | --- |
| **Nombre de Cookie** | `__Host-jopoi_session` | `jopoi_session` |
| **Directiva `Secure`** | `true` | `false` |
| **Directiva `HttpOnly`** | `true` | `true` |
| **Directiva `SameSite`** | `lax` | `lax` |
| **Directiva `Path`** | `/` | `/` |
| **Directiva `Domain`** | *Omitida* (prohibida por la especificación `__Host-`) | *Omitida* |

### Migración y Rechazo de Ambigüedad (`S22-16`)

1. **Migración transparente sin extensión de vigencia:**
   Cuando una petición HTTPS presenta únicamente la cookie heredada `jopoi_session`, los endpoints de sesión (`GET /api/demo/session` y `POST /api/demo/session`) emiten la nueva cookie `__Host-jopoi_session` conservando exactamente el `expiresAt` original de la sesión existente (calculando `maxAge` relativo al tiempo restante) y eliminan la cookie legada emitiendo `jopoi_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`.
2. **Rechazo de coexistencia ambigua:**
   Si una solicitud envía simultáneamente `__Host-jopoi_session` y `jopoi_session` con valores diferentes, `extractSessionCredentials` marca `ambiguous: true`. Tanto `requireBrowserMutation` como las rutas de lectura rechazan inmediatamente la petición con `401 Unauthorized` (`SESSION_REQUIRED`), impidiendo cualquier ataque de fijación o sombra de sesión por subdominio. Si ambos valores son idénticos, se realiza la migración limpiando la cookie legada.

---

## 2. Token CSRF derivado por HMAC (`D10`)

Para desacoplar el secreto de transporte de la credencial de sesión:

1. **Derivación determinista no reversible:**
   $$\text{csrfToken} = \text{HMAC-SHA256}(\text{SESSION\_SECRET}, \text{"csrf-v1:"} \mathbin{\Vert} \text{sessionToken})$$
   El token CSRF no expone el token de sesión y no puede falsificarse sin el secreto del servidor.
2. **Comparación en tiempo constante:**
   La verificación [`csrfTokenMatches`](../src/server/sessions/credentials.ts) utiliza `crypto.timingSafeEqual` con buffers de longitud fija derivados por SHA-256 para evitar fugas por canal lateral de tiempo.
3. **Entrega Same-Origin y Privacidad de Caché:**
   - La lectura `GET /api/demo/session` entrega el CSRF token en el encabezado de respuesta `X-CSRF-Token` y en el cuerpo JSON (`DemoSessionResponse.csrfToken`), bajo encabezados `Cache-Control: private, no-store` y `Vary: Cookie, Accept`.
   - `GET /api/demo/session` es una lectura idempotente que nunca crea sesiones ni realiza escrituras SQL en GET.
4. **Almacenamiento exclusivo en memoria:**
   - [`src/frontend/csrf.ts`](../src/frontend/csrf.ts) gestiona el CSRF token en memoria volátil de la aplicación frontend.
   - **Nunca** se almacena en `localStorage`, `sessionStorage` ni se expone en logs de cliente.
   - Se limpia inmediatamente al llamar `expire()` en el panel de operaciones o al recibir errores `401` (`SESSION_REQUIRED`, `SESSION_EXPIRED`).

---

## 3. Barrera de Mutación en el Servidor (`D10`, `S22-18`)

[`requireBrowserMutation`](../src/server/http.ts) aplica las siguientes validaciones defensivas en profundidad antes de procesar cualquier mutación (`POST`):

1. **`Origin` confiable:** `Origin` debe coincidir exactamente con `APP_URL` configurado en el servidor (nunca encabezados `Host` o `X-Forwarded-Host` suministrados por el cliente).
2. **Encabezado personalizado:** Requiere `X-Jopoi-Request: demo`.
3. **Tipo de contenido estricto:** Requiere `Content-Type: application/json`.
4. **Fetch Metadata defensivo:**
   - `Sec-Fetch-Site`: Se rechaza categóricamente `cross-site` (`REQUEST_FORBIDDEN` / `403`).
   - `Sec-Fetch-Mode`: Se rechaza categóricamente `navigate` (`REQUEST_FORBIDDEN` / `403`), bloqueando envíos de formularios HTML directos o navegación forzada por atacantes.
5. **Verificación de CSRF:**
   - Si la petición incluye una cookie de sesión válida, se exige obligatoriamente el encabezado `X-CSRF-Token` coincidente con el HMAC de la sesión. Si falta o difiere, se rechaza con `403 Forbidden` (`REQUEST_FORBIDDEN`).
   - En peticiones anónimas iniciales (`POST /api/demo/session` o `POST /api/demo-requests` sin cookie), el arranque anónimo está protegido por `Origin`, `X-Jopoi-Request`, `Content-Type`, Fetch Metadata y rate limiting global; una vez establecida la cookie, el CSRF es estrictamente obligatorio.

---

## 4. Transporte Frontend y Especificación OpenAPI

- **Transportes de mutación actualizados:**
  - [`src/frontend/operation-api.ts`](../src/frontend/operation-api.ts) y [`src/frontend/demo-request.ts`](../src/frontend/demo-request.ts) inyectan automáticamente el encabezado `X-CSRF-Token` obtenido de la sesión.
  - [`src/frontend/api.ts`](../src/frontend/api.ts) captura y actualiza en memoria el `X-CSRF-Token` a partir de cualquier respuesta exitosa.
- **Contrato OpenAPI 3.2:**
  - [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y [`public/openapi.json`](../public/openapi.json) documentan el esquema de seguridad `demoSession` con la cookie `__Host-jopoi_session` en HTTPS, los parámetros de encabezado `X-CSRF-Token` en las mutaciones y el encabezado de respuesta `X-CSRF-Token` en la lectura y creación de sesión.

---

## 5. Evidencia de Verificación

### Pruebas de Contratos y Frontera (`node --test`)
- [`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts):
  - `sessionCookiePolicy` distingue HTTPS (`__Host-`, `Secure`, sin `Domain`) y HTTP local.
  - `csrfToken` vincula la sesión, no expone credencial y compara en tiempo constante.
  - `requireBrowserMutation` valida `Origin`, header custom, metadata (`cross-site`, `navigate`), ambigüedad y CSRF.
- [`tests/contracts/transports.test.ts`](../tests/contracts/transports.test.ts):
  - Verifica que los transportes de mutación envían `X-CSRF-Token` y `readApi` captura el token de la respuesta.

### Pruebas Integradas de Seguridad (`Vitest`)
- [`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts):
  - `S22-16 · HTTPS usa __Host-, migración sin extender vencimiento y rechazo de ambigüedad`: Pasa exitosamente.
  - `S22-18 · mutaciones protegidas por CSRF, Origin y Fetch Metadata`: Pasa exitosamente.
  - Las 24 pruebas de seguridad de la suite pasan en su totalidad (`24 passed (24)`).

### Quality Gate Integral (`scripts/quality.ts`)
Aprobó el 100% de los 16 pasos:
1. `db:generate`: OK
2. `db:validate`: OK
3. `typecheck`: OK (0 diagnósticos)
4. `typecheck:api`: OK (0 diagnósticos)
5. `lint`: OK (227 archivos verificados sin errores ni advertencias)
6. `typecheck:report`: OK (`PERFIL ESTRICTO OBLIGATORIO: 0 diagnósticos`)
7. `api:check`: OK (`openapi.json` en sincronía)
8. `test:contracts`: OK (16 pruebas pasadas)
9. `test:quality`: OK (10 pruebas pasadas)
10. `test:security`: OK
11. `test:domain`: OK
12. `test:observability`: OK
13. `test:cli`: OK
14. `test:ui:tokens`: OK
15. `test:api`: OK (8 suites, 66 pruebas pasadas)
16. `build`: OK (`next build` compilado con Turbopack exitosamente)
