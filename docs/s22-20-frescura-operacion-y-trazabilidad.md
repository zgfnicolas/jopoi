# S22-20 · Hacer visible la antigüedad y actualizar antes de editar (`D08`, `D11`, `AUD-10`)

## Trazabilidad y objetivos

- **Spec S22:** historias 11, 49, 53, 54, 55 y 57; decisiones `D08` y `D11`; hallazgo de auditoría `AUD-10`; escenarios `S22-13`, `S22-19`, `S22-20` y `S22-21`.
- **Objetivo:** Ayudar al participante y al lector a distinguir con precisión la última lectura de un estado de red en tiempo real, evitando escrituras accidentales desde vistas desactualizadas sin recurrir a polling constante ni promesas falsas de seguimiento en vivo.

---

## 1. Exposición de `observedAt` y Comunicación de Frescura (`D11`, `AUD-10`, `S22-20`)

1. **Contratos Tipados y OpenAPI:**
   - En [`src/shared/run-contracts.ts`](../src/shared/run-contracts.ts) y [`src/shared/trace-contracts.ts`](../src/shared/trace-contracts.ts):
     - `DemoRunResponse` incorpora `readonly observedAt: string;`.
     - `OperationResource` incorpora `readonly observedAt: string;`.
     - `PublicTraceResponse` incorpora `readonly observedAt: string;`.
   - En [`src/frontend/operation-models.ts`](../src/frontend/operation-models.ts) y [`src/frontend/trace-models.ts`](../src/frontend/trace-models.ts):
     - `operationViewSchema`, `operationResourceSchema` y `publicTraceSchema` exigen `observedAt: date` (formato ISO 8601 UTC estricto).
     - El artefacto publicado [`public/openapi.json`](../public/openapi.json) refleja estos atributos en `RunResponse`, `OperationResource` y `PublicTrace`.
2. **Servicio y Consultas Node.js:**
   - En [`src/server/operations/queries.ts`](../src/server/operations/queries.ts) (`getCurrentRun`, `getOwnedRun`, `getOperationResource`) y [`src/server/traces/queries.ts`](../src/server/traces/queries.ts) (`getTrace`), las lecturas capturan el instante de observación mediante el reloj del entorno (`wallNow().toISOString()`).
3. **Estabilidad de ETag y Caché Condicional (RFC 9110 / 304 Not Modified):**
   - En [`src/server/operations/etag.ts`](../src/server/operations/etag.ts):
     - `computeRunEtag` y `computeTraceEtag` omiten deliberadamente `observedAt` del digest SHA-256.
     - Esto garantiza que dos lecturas idénticas de la misma entidad en instantes distintos mantengan el mismo ETag fuerte, permitiendo que la validación condicional `If-None-Match` devuelva `304 Not Modified` sin degradar el rendimiento por variaciones de milisegundos.
4. **Claridad en la Interfaz de Usuario:**
   - En [`src/components/operation-panel.tsx`](../src/components/operation-panel.tsx) y [`src/components/trace-reader.tsx`](../src/components/trace-reader.tsx):
     - Se informa cuándo se obtuvo la lectura con formato de fecha y hora local (`formatDate(observedAt)`).
     - Se declara explícitamente: *"No hay seguimiento continuo ni actualizaciones en segundo plano."* y *"Actualizar vuelve a leer SQL y descarta las observaciones transitorias anteriores."*

---

## 2. Estado Privado: Marcado a los 60 Segundos y Exigencia de Refresh (`D08`, `D11`, `S22-20`)

En [`src/frontend/use-operation-panel.ts`](../src/frontend/use-operation-panel.ts) y [`src/components/operation-panel.tsx`](../src/components/operation-panel.tsx):

1. **Detección de Antigüedad (60 Segundos):**
   - Tras recibir `DemoRunResponse`, se evalúa el tiempo transcurrido desde `observedAt`.
   - Se programa un temporizador local para el remanente de 60 segundos; una vez transcurrido este plazo, se establece `stale = true`.
2. **Bloqueo Preventivo de Mutaciones:**
   - Cuando `stale === true`, `blocked` se vuelve `true`:
     - Los botones de envío en [`src/components/operation-task.tsx`](../src/components/operation-task.tsx), el selector de roles y la creación de nuevos recorridos quedan deshabilitados.
     - Las funciones `command`, `retryPublication` y `makeIntent` rechazan tempranamente cualquier ejecución mientras el estado sea antiguo.
3. **Preservación de Borrador e Intención Pendiente:**
   - A diferencia de la expiración de sesión, marcar el estado como `stale` **no incrementa** `draftRevision`.
   - Los datos ingresados en el formulario local (cantidad, humedad, selecciones) se preservan intactos en la vista sin resetear los inputs del usuario.
   - De igual modo, si existía una intención en estado `"uncertain"`, esta se preserva para reintentos sin ser sobreescrita por lecturas secundarias.
4. **Aviso Prominente y Actualización de Precondición:**
   - El panel muestra un aviso `Notice` de tono `warning`: *"La lectura tiene más de 60 segundos. El estado privado visible es antiguo. Para evitar sobreescrituras y conflictos de concurrencia, actualizá la lectura antes de realizar otra acción. Tu borrador y cambios locales se conservan."*
   - Al pulsar *"Actualizar lectura"*, se dispara `refresh()`, que consulta el estado más reciente de la operación y obtiene el `ETag` fresco del subrecurso `/operation`.
   - Esto limpia `stale = false`, reactiva los controles y asegura que la próxima escritura viaje con el `If-Match` correcto para la validación server-side.

---

## 3. Contraste por Hito: Etiquetado de Observaciones de Más de 5 Minutos (`D11`, `S22-20`)

En [`src/components/trace-event.tsx`](../src/components/trace-event.tsx) y [`src/frontend/use-trace-verification.ts`](../src/frontend/use-trace-verification.ts):

1. **Identificación de Observaciones Previas:**
   - Cuando el usuario solicita un contraste puntual con testnet (`verify()`), el resultado expone `observation.evidence.observedAt`.
   - Si `Date.now() - Date.parse(evidence.observedAt) >= 300_000` (5 minutos), la observación se clasifica inmediatamente como antigua (`isOldObservation = true`).
   - Un temporizador local y listeners de ciclo de vida reevalúan el umbral si el usuario permanece en la página o regresa a ella.
2. **Conservación de la Confirmación Histórica:**
   - La etiqueta de observación anterior no borra ni modifica la confirmación histórica del hito (`event.storedVerification` y `event.publication.confirmedAt`).
   - Se muestra un aviso explicativo: *"Esta consulta de contraste tiene más de cinco minutos. No sustituye una verificación actual ni garantiza coincidencia vigente en testnet. La confirmación histórica de red permanece registrada. Podés solicitar un nuevo contraste para actualizarla."*
3. **Descarte de Observaciones Transitorias en Refresh:**
   - `useTraceVerification` expone el método `clear()`.
   - Al pulsar *"Actualizar lectura"* en `TraceReader`, se limpian los contrastes transitorios locales para garantizar que no se retengan observaciones obsoletas tras una recarga explícita del historial.

---

## 4. Ciclo de Vida del Navegador y Ausencia de Polling (`D11`, `S22-20`, `S22-21`)

1. **Eventos `pageshow` y `visibilitychange`:**
   - Tanto en `useOperationPanel`, `useReadResource` como en `TraceEventView`, se registran listeners pasivos para `pageshow` y `visibilitychange`.
   - Al reactivar la pestaña o restaurarla desde la memoria del navegador (BFCache), se reevalúa de inmediato si la sesión o el recorrido expiraron, o si el estado privado superó los 60 segundos de antigüedad.
2. **Descarte Seguro de Respuestas Tardías:**
   - En `useOperationPanel`, cada operación genera un número de época (`generation.current`). Si llega una respuesta de red tras una expiración, cierre de sesión o cambio de generación, la respuesta tardía es ignorada de manera segura sin alterar el estado.
3. **Cero Polling y Cero Reintentos Automáticos:**
   - No existen bucles `setInterval` ni reintentos automáticos de red. Toda actualización de datos proviene de una acción voluntaria del usuario mediante el botón *"Actualizar lectura"*.

---

## 5. Verificación y Calidad

- **Test de Escenario S22-20:** [`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts) verifica que:
  - Todas las lecturas exponen `observedAt` en formato ISO 8601 UTC válido.
  - La estabilidad del `ETag` ante instantes variables de `observedAt` preserva el soporte `304 Not Modified`.
  - El avance del reloj más allá de 60 s activa la condición de antigüedad y la posterior lectura restablece frescura y `ETag`.
  - El avance del reloj más allá de 5 minutos clasifica el contraste como observación anterior sin perder confirmaciones históricas.
  - El HTML inicial contiene las advertencias de frescura y ausencia de actualización en segundo plano.
- **Test de Contratos:** [`tests/contracts/transports.test.ts`](../tests/contracts/transports.test.ts) valida la exigencia y rechazo de campos `observedAt` por `operationViewSchema`, `operationResourceSchema` y las reglas matemáticas de umbral.
- **Gate de Calidad:**
  - `npm run typecheck` (cero errores de tipos)
  - `npm run typecheck:strict` (cero diagnósticos)
  - `npm run typecheck:api` (cero diagnósticos)
  - `npm run lint` (Biome: 233 archivos revisados sin advertencias)
  - `npm run test:contracts` (21 pruebas aprobadas)
  - `npm run test:domain`, `test:cli`, `test:observability`, `test:ui:tokens` (todas aprobadas)
  - `npm run build` (build de producción Turbopack exitoso)
