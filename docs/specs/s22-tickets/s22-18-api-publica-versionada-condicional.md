# S22-18 · Consultar trazabilidad pública versionada y condicional (`D07`, `D08`, `D11`, `AUD-07`, `AUD-10`)

## Trazabilidad y objetivos

- **Spec S22:** historias 36, 38, 41, 42, 51, 52, 54 y 86; decisiones `D07`, `D08` y `D11`; hallazgos de auditoría `AUD-07` y `AUD-10`; escenarios `S22-01`, `S22-12`, `S22-14` y `S22-19`.
- **Objetivo:** Establecer la superficie pública canónica v1 (`/api/v1/traces/{traceId}` y su subrecurso de contraste `/api/v1/traces/{traceId}/events/{eventId}/verification`) preservando las rutas anteriores (`/api/traces/...`) como adaptadores de compatibilidad que exponen encabezados estándar `Deprecation: true` y `Link: </api/v1/...>; rel="successor-version"` sin emitir `Sunset` prematuro. Implementar validadores HTTP fuertes (ETag SHA-256 canónico RFC 8785) con soporte de `If-None-Match` respondiendo `304 Not Modified` sin cuerpo únicamente después de verificar existencia, vigencia y admisión del recurso, conservando la política de no-store, privacidad estricta y ausencia de efectos colaterales (sin sesiones, cookies ni escrituras HCS).

---

## 1. Superficie Pública Canónica v1 y Adaptadores de Compatibilidad (`D07`, `S22-19`)

Se introducen las rutas canónicas versionadas para la trazabilidad pública y el contraste de eventos:

1. **Rutas canónicas v1:**
   - [`/api/v1/traces/[traceId]`](../src/app/api/v1/traces/[traceId]/route.ts)
   - [`/api/v1/traces/[traceId]/events/[eventId]/verification`](../src/app/api/v1/traces/[traceId]/events/[eventId]/verification/route.ts)
2. **Adaptadores de compatibilidad:**
   - [`/api/traces/[traceId]`](../src/app/api/traces/[traceId]/route.ts)
   - [`/api/traces/[traceId]/events/[eventId]/verification`](../src/app/api/traces/[traceId]/events/[eventId]/verification/route.ts)
3. **Mecanismo de transición y cabeceras de deprecación:**
   - Ambas superficies delegan en los mismos manejadores [`getTraceHttp`](../src/server/traces/http.ts) y [`getVerificationHttp`](../src/server/traces/http.ts), garantizando reglas de admisión, cuotas de lectura pública y manejo de errores uniformes.
   - Cuando una petición ingresa a través del prefijo heredado `/api/traces/...`, la respuesta HTTP incluye:
     - `Deprecation: true`
     - `Link: </api/v1/traces/...>; rel="successor-version"`
   - La cabecera `Sunset` se omite de forma explícita de acuerdo con `D07`, ya que requiere consenso previo de fecha y medición de tráfico de clientes.
   - Las rutas v1 canónicas no emiten cabeceras `Deprecation` ni `Link` de sucesión.

---

## 2. Validadores Fuertes y Evaluación Condicional (`D07`, `D08`, `S22-14`)

En [`src/server/operations/etag.ts`](../src/server/operations/etag.ts) y [`src/server/traces/http.ts`](../src/server/traces/http.ts):

1. **Cálculo de ETag Fuerte:**
   - Se utiliza [`computeTraceEtag`](../src/server/operations/etag.ts) aplicando hash SHA-256 sobre la representación serializada canónicamente mediante RFC 8785 (`canonicalJson`).
   - El resultado tiene formato de entidad fuerte RFC 9110: `"${sha256}"`.
2. **Respuesta `304 Not Modified`:**
   - Si la cabecera `If-None-Match` del cliente coincide con el ETag actual (incluyendo soporte de listas separadas por comas y comodín `*`), el servidor responde con status `304`, cuerpo vacío (`null`), y cabeceras `ETag`, `Cache-Control: no-store` y `Vary: Accept`.
3. **Precedencia de Existencia, Vigencia y Admisión:**
   - El evaluador de `If-None-Match` se ejecuta **exclusivamente después** de comprobar:
     - **Admisión:** Verificación de límites de tasa (`requireRateLimit(request, "TRACE" | "VERIFICATION")`). Solicitudes que excedan el límite devuelven `429 Too Many Requests`.
     - **Existencia:** Si el identificador `traceId` o `eventId` no existe en la base de datos, devuelve `404 Not Found` (nunca `304`).
     - **Vigencia:** Si el recorrido expiró (`run.expiresAt <= now()`), devuelve `410 Gone` (`TRACE_EXPIRED`, nunca `304`).

---

## 3. Caché, Privacidad y Ausencia de Efectos Colaterales (`D11`, `AUD-10`)

1. **Control de Caché Público:**
   - Las respuestas públicas emiten `Cache-Control: no-store` y `Vary: Accept`.
   - Se diferencian rigurosamente de las rutas privadas (`private, no-store` y `Vary: Cookie, Accept`), impidiendo que proxies compartidos almacenen o mezclen respuestas.
2. **Privacidad y Exclusión de Atributos Internos:**
   - No se expone información de sesión, token de autenticación, token CSRF, datos de contacto ni claves del operador de Hedera.
   - No se emite la cabecera `Set-Cookie` en ninguna consulta pública.
   - Las consultas GET no inician sesiones ni disparan transacciones o llamadas mutables en Hedera Consensus Service.
3. **Distinción de Lectura Actual con `observedAt`:**
   - En el subrecurso de contraste de verificación, `observation.evidence.observedAt` documenta la marca temporal exacta de la consulta en vivo al Mirror Node, distinguiéndola de `confirmedAt` (marca de consenso del hito en HCS) y `appliedAt` (marca de registro en SQL).

---

## 4. Consumo en Frontend

- [`src/components/trace-reader.tsx`](../src/components/trace-reader.tsx) y [`src/frontend/use-trace-verification.ts`](../src/frontend/use-trace-verification.ts) han sido actualizados para consumir directamente los endpoints canónicos `/api/v1/traces/{traceId}` y `/api/v1/traces/{traceId}/events/{eventId}/verification`.

---

## 5. Especificación OpenAPI y Calidad

- **OpenAPI 3.2:**
  - Registrado en [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y compilado en [`public/openapi.json`](../public/openapi.json).
  - Describe `/api/v1/traces/{traceId}`, `/api/v1/traces/{traceId}/events/{eventId}/verification`, y marca como `deprecated: true` las rutas anteriores `/api/traces/{traceId}` y `/api/traces/{traceId}/events/{eventId}/verification`.
  - Documenta las cabeceras `If-None-Match`, `ETag`, `Deprecation`, `Link` y el código `304`.
- **Verificación de Pruebas:**
  - Contratos de frontera: [`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts).
  - Inventario de rutas Next.js: [`tests/contracts/openapi.test.ts`](../tests/contracts/openapi.test.ts).
  - Pruebas integradas de API: Caso `S22-19` en [`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts).
