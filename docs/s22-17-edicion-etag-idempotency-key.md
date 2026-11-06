# S22-17 · Editar la operación con If-Match e Idempotency-Key (`D06`, `D07`, `D08`, `AUD-07`, `AUD-14`)

## Trazabilidad y objetivos

- **Spec S22:** historias 10, 11, 36, 39, 40, 42, 55 y 75; decisiones `D06`, `D07` y `D08`; hallazgos de auditoría `AUD-07` y `AUD-14`; escenarios `S22-01`, `S22-03`, `S22-12`, `S22-13` y `S22-14`.
- **Objetivo:** Implementar la edición atómica de la operación del recorrido mediante un subrecurso HTTP específico (`/api/demo/runs/{traceId}/operation`) con métodos `GET` y `PATCH`, precondiciones de concurrencia optimista con ETag fuerte (`If-Match` obligatorio para evitar lost updates y emitir `412 Precondition Failed` / `428 Precondition Required`), negociación condicional de lectura (`If-None-Match` con respuesta `304 Not Modified`), y encabezado estándar `Idempotency-Key` vinculado al registro transaccional de recibos, resolviendo replays autorizados antes de evaluar precondiciones y rechazando colisiones de carga (`409 IDEMPOTENCY_CONFLICT`) y discrepancias de entrada (`400 INVALID_INPUT`).

---

## 1. Subrecurso Operativo (`GET` y `PATCH /api/demo/runs/{traceId}/operation`, `D06`, `S22-14`)

El subrecurso operativo aísla la edición y lectura del estado de la operación del recorrido:

1. **Representación desacoplada:**
   - La respuesta expone exclusivamente el contrato [`OperationResource`](../src/shared/run-contracts.ts): `{ traceId, version, operation }`.
   - Se desacopla de los datos agregados del recorrido completo (`DemoRunResponse`), evitando transferir innecesariamente cuotas, resúmenes económicos, publicaciones en HCS, eventos o información de sesión.
2. **Negociación condicional en `GET`:**
   - Emite un ETag fuerte calculado con el hash SHA-256 canónico RFC 8785 sobre el estado operativo: `computeOperationEtag(operation)`.
   - Evalúa `If-None-Match`: si el ETag coincide con la versión actual (o una lista que lo contenga / comodín `*`), responde inmediatamente `304 Not Modified` con cuerpo vacío.
3. **Seguridad y orden de autorización:**
   - La autenticación del visitante y la verificación de actividad de la sesión (`requireOwnedRun`) preceden a la evaluación de `If-None-Match`.
   - Si la sesión venció o fue revocada, el servidor responde categóricamente `401 Unauthorized` (`SESSION_EXPIRED`), sin devolver `304`.
   - Si otra sesión intenta consultar el subrecurso, recibe `404 Not Found`, conservando el aislamiento multitenant.

---

## 2. Precondición Fuerte `If-Match` y Concurrencia Optimista (`D07`, `AUD-07`, `S22-13`)

En [`src/server/operations/http.ts`](../src/server/operations/http.ts) y [`src/server/operations/commands.ts`](../src/server/operations/commands.ts):

1. **Obligatoriedad de `If-Match`:**
   - Todo intento de modificar la operación mediante `PATCH /api/demo/runs/{traceId}/operation` exige el encabezado `If-Match`.
   - Si la cabecera está ausente o no contiene un ETag reconocible, la solicitud es rechazada con `428 Precondition Required` (`PRECONDITION_REQUIRED`).
2. **Evaluación de ETag y prevención de sobrescrituras perdidas:**
   - Se compara el ETag recibido con el ETag fuerte calculado atómicamente bajo bloqueo transaccional (`FOR UPDATE`).
   - Si difiere, la operación es abortada con `412 Precondition Failed` (`PRECONDITION_FAILED`) sin producir efectos secundarios ni avanzar la versión.
   - En peticiones concurrentes compitiendo por la misma versión, exactamente una transacción aplica el cambio (`200 OK`) y la competidora recibe `412 Precondition Failed`, erradicando sobrescrituras perdidas (*lost updates*).

---

## 3. Clave de Idempotencia Estándar y Resolución de Replay (`D08`, `AUD-14`, `S22-03`, `S22-13`)

1. **Encabezado `Idempotency-Key`:**
   - En `PATCH`, el encabezado `Idempotency-Key` es obligatorio y debe ser un UUID válido.
   - Si falta o su formato es incorrecto, responde `400 Bad Request` (`INVALID_INPUT`).
   - Si el cuerpo incluye además la propiedad opcional `requestId` y su valor no coincide con el encabezado `Idempotency-Key`, la petición se rechaza con `400 Bad Request` (`INVALID_INPUT`).
2. **Resolución de Replay previo a la precondición:**
   - Un replay de una clave ya ejecutada con idéntica carga útil retorna el resultado previamente persistido con `replayed: true`.
   - Esta resolución ocurre **antes** de volver a evaluar el `If-Match`: la petición original alteró el ETag, pero el replay legítimo no debe fallar por precondición ante su propio resultado.
3. **Detección de colisiones:**
   - Si se envía la misma `Idempotency-Key` con parámetros diferentes (ej. diferente cantidad, acción o campos modificados), se devuelve `409 Conflict` (`IDEMPOTENCY_CONFLICT`). No se consume cuota ni se alteran los datos del recorrido.

---

## 4. Adaptación del Frontend y Manejo de Conflictos

1. **Transporte de API:**
   - [`src/frontend/operation-api.ts`](../src/frontend/operation-api.ts) implementa `patchOperation<T>()`, inyectando automáticamente `If-Match`, `Idempotency-Key`, `X-CSRF-Token` y `X-Jopoi-Request`.
   - Captura el encabezado `ETag` de la respuesta para actualizar la referencia local.
2. **Hook de Operación (`use-operation-panel`):**
   - [`src/frontend/use-operation-panel.ts`](../src/frontend/use-operation-panel.ts) almacena el `operationEtag`.
   - Al ejecutar un comando del panel, dispara `PATCH /api/demo/runs/{traceId}/operation`.
   - Administra de forma transparente los códigos `PRECONDITION_FAILED` y `IDEMPOTENCY_CONFLICT`, solicitando al operador refrescar la información antes de reintentar para no pisar cambios concurrentes.
   - `POST /api/demo/runs/{traceId}/commands` se mantiene plenamente compatible con el esquema anterior de `expectedVersion`.

---

## 5. Especificación OpenAPI y Calidad

- **OpenAPI 3.2:**
  - Registrado en [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y compilado en [`public/openapi.json`](../public/openapi.json).
  - Incluye `GET` y `PATCH` para `/api/demo/runs/{traceId}/operation`, parámetros de encabezado `If-Match`, `If-None-Match`, `Idempotency-Key`, respuestas `304 Not Modified`, `412 Precondition Failed` y `428 Precondition Required`.
- **Verificación de Calidad (`npm run quality:check`):**
  - Todas las 16 etapas del Quality Gate (validación de esquemas Prisma, tipado estricto con 0 diagnósticos, linting Biome, contratos OpenAPI, pruebas de dominio, observabilidad, seguridad, CLI, contratos HTTP y las 71 pruebas de API) pasan satisfactoriamente.
