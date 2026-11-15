# S22-22 · Recuperar y exportar sólo los datos necesarios (`D06`, `D16`, `D17`, `AUD-12`, `AUD-15`, `AUD-16`)

## Trazabilidad y objetivos

- **Spec S22:** historias 31, 32, 61, 73, 74, 75 y 86; decisiones `D06`, `D16` y `D17`; hallazgos de auditoría `AUD-12`, `AUD-15` y `AUD-16`; escenarios `S22-03`, `S22-11`, `S22-28` y `S22-30`.
- **Objetivo:** Recuperar y exportar sólo los datos necesarios con proyecciones explícitas, orden determinista y streaming/paginación segura. Alineado a la decisión `D16` (índices mínimos y proyecciones acotadas) y `D17` (exportación CSV segura, delimitador `;`, escape de fórmulas, sin credenciales ni hashes), respondiendo a los hallazgos `AUD-12` (proyección selectiva en lecturas y mutaciones), `AUD-15` (plan de índices por costo de lectura y escritura) y `AUD-16` (bloqueo secuencial sin scans cuadráticos redundantes).

---

## 1. Proyecciones Explícitas en Mutaciones y Replays (`D06`, `D16`, `AUD-12`)

En [`src/server/operations/commands.ts`](../src/server/operations/commands.ts):

1. **Eliminación de overfetching en replays de comandos (`executeOperationCommand`):**
   - Anteriormente, la búsqueda del recibo previo utilizaba `include: { event: { include: { publication: true } } }`, proyectando implícitamente todas las columnas escalares de `CommandReceipt`, `OperationEvent` y `HcsPublication`, incluyendo bytes pesados (`signedTransactionBytes`), historiales (`attemptHistory`), evidencias JSON completas (`verificationEvidence`) y campos de control de lease (`leaseOwner`, `leaseExpiresAt`).
   - Se reemplazó por una proyección explícita `select` que recupera únicamente:
     - En `commandReceipt`: `intentHash`, `action`, `resultingVersion`, `result`.
     - En `event`: `id`, `runId`, `ordinal`, `type`, `simulatedRole`, `appliedAt`, `payloadVersion`, `digest`, `payload`.
     - En `publication`: `select: publicationSummarySelect` (que omite explícitamente `signedTransactionBytes`, `attemptHistory`, `verificationEvidence` y metadatos de lease).
2. **Proyección mínima en creación de eventos:**
   - La inserción `tx.operationEvent.create` utilizaba `include: { publication: true }`.
   - Se reemplazó por `select: { publication: { select: publicationSummarySelect } }`, eliminando la transferencia de campos no utilizados en el retorno inmediato.
3. **Proyección acotada en replays de edición atómica (`patchOperationCommand`):**
   - La búsqueda del recibo previo mediante `idempotencyKey` requería comprobar únicamente la existencia de la publicación asociada al evento para garantizar consistencia interna.
   - Se reemplazó el `include` completo por `publication: { select: { eventId: true } }`, omitiendo por completo columnas binarias o JSON.

---

## 2. Desacoplamiento de Proyecciones de Trazabilidad y Verificación (`D16`, `AUD-12`)

En [`src/server/traces/projection.ts`](../src/server/traces/projection.ts) y [`src/server/traces/queries.ts`](../src/server/traces/queries.ts):

1. **`publicTraceEventSelect` para listado de trazas (`getTrace`):**
   - La consulta general de un recorrido (`GET /api/traces/:traceId` y `GET /api/v1/traces/:traceId`) proyecta los hitos acumulados para visualización.
   - En esta consulta, **nunca se leen los intentos de envío de red (`attempts`)**, pues la función de proyección de traza (`projectTraceEvent`) sólo evalúa los campos consolidados de `publication` (`state`, `topicId`, `transactionId`, `sequenceNumber`, `consensusTimestamp`, `confirmedAt`, `lastErrorCode`, `verificationState`, `verifiedAt`, `verificationEvidence`).
   - Se definió `publicTracePublicationSelect` y `publicTraceEventSelect` excluyendo la relación `attempts`.
2. **`publicVerificationEventSelect` para verificación puntual (`loadEvent` / `getVerification`):**
   - La tabla `HcsSubmissionAttempt` sólo se consulta cuando el cliente solicita verificar un hito específico (`GET /api/traces/:traceId/events/:eventId/verification`) mediante la función `hasSubmittedAttempt(row)`.
   - Para este flujo se definió `publicVerificationPublicationSelect`, que extiende la proyección base agregando estrictamente `attempts: { select: { transactionId: true, state: true } }`, manteniendo excluidos `signedTransactionBytes` y campos de infraestructura interna.

---

## 3. Minimización en Verificación de Capacidad Externa HCS (`D16`, `AUD-12`)

En [`src/server/hedera/coordinator.ts`](../src/server/hedera/coordinator.ts):

- Durante la adquisición de permisos de capacidad concurrente (`EXTERNAL_CAPACITY_POLICY`), si no hay permisos disponibles, el despachador aplica un rechazo temprano sin contactar al proveedor de red y difiere el reintento.
- Anteriormente ejecutaba `tx.hcsPublication.findUnique({ where: { eventId }, include: { event: { include: { run: true } } } })`, transfiriendo toda la fila de la publicación (incluyendo bytes firmados), el evento completo y el recorrido completo (incluyendo el JSON `scenarioSnapshot` con todos los metadatos de empresas, rutas y tarifas).
- Se reemplazó por una proyección mínima profunda:
  ```typescript
  select: { event: { select: { run: { select: { expiresAt: true } } } } }
  ```
  Esto reduce la transferencia SQL a cero bytes superfluos, recuperando únicamente la marca de expiración necesaria para calcular el cooldown.

---

## 4. Simplificación Lineal del Bloqueo Secuencial de Hitos (`AUD-16`)

En [`src/server/operations/queries.ts`](../src/server/operations/queries.ts):

1. **Contexto:**
   - La regla de negocio estipula que un hito en la interfaz se considera bloqueado (`blockedBy`) si existe algún hito anterior en el orden secuencial (`ordinal < row.ordinal`) cuya publicación aún no haya alcanzado el estado `"CONFIRMED"`.
   - Previamente, el mapeo de eventos evaluaba:
     ```typescript
     rows.find(previous => previous.ordinal < row.ordinal && previous.publication?.state !== "CONFIRMED")?.id ?? null
     ```
     dentro del `.map`, lo que generaba un escaneo anidado $O(n^2)$. Aunque $n \le 5$ (cinco hitos máximos por recorrido), la auditoría `AUD-16` recomendaba simplificar la lógica para mayor claridad y legibilidad.
2. **Optimización Lineal $O(n)$:**
   - Dado que las filas ya provienen ordenadas deterministamente por `orderBy: { ordinal: "asc" }`, cualquier hito no confirmado es el primer bloqueador para todos los hitos subsiguientes.
   - Se introdujo un acumulador lineal:
     ```typescript
     let firstUnconfirmedId: string | null = null;
     const events = rows.map((row) => {
       if (row.publication === null) throw new ApplicationError("INTERNAL_ERROR");
       const blockedBy = firstUnconfirmedId;
       if (firstUnconfirmedId === null && row.publication.state !== "CONFIRMED") {
         firstUnconfirmedId = row.id;
       }
       return {
         event: readPublicEvent(row, run.traceId, scenario),
         publication: publicationSummary(row.publication, { blockedBy, quota }),
       };
     });
     ```
   - Este algoritmo produce exactamente el mismo resultado semántico en un único pase lineal, aumentando la claridad del código sin alterar contratos ni tipos.

---

## 5. Exportación de Contactos Determinista y Segura (`D17`)

En [`src/server/contacts/export.ts`](../src/server/contacts/export.ts):

1. **Paginación por Cursor Acotada:**
   - Paginación basada en cursor determinista `(createdAt, id)` con tamaño de página acotado a 500 registros (`PAGE_SIZE = 500`).
   - Evita `OFFSET` arbitrario y garantiza consumo constante de memoria independiente del volumen de datos históricos.
2. **Proyección Estricta de Campos:**
   - La consulta SQL selecciona exclusivamente:
     ```typescript
     select: { id: true, createdAt: true, name: true, email: true, company: true, message: true }
     ```
   - Se excluyen terminantemente identificadores de idempotencia privados (`requestId`) y hashes criptográficos de intención (`intentHash`).
3. **Formato y Mitigación de Inyección de Fórmulas:**
   - Delimitador `;`, terminación CRLF (`\r\n`) y BOM UTF-8 (`\uFEFF`) para compatibilidad en planillas de cálculo.
   - Sanitización contra inyección de fórmulas mediante prefijo `\t` si el valor comienza con `=`, `+`, `-`, `@`, sus equivalentes Unicode de ancho completo (`＝`, `＋`, `－`, `＠`), o caracteres de control/espacio en blanco.
4. **Seguridad del Archivo Temporal:**
   - Directorio `.cache/exports` con permisos restrictivos `0700` y archivo creado con bandera exclusiva `wx` y permisos `0600`.
   - Limpieza garantizada mediante bloque `try/catch/unlink` en caso de fallo durante la escritura.

---

## 6. Justificación de Índices por Costo y Planes de Ejecución (`D16`, `AUD-15`)

La auditoría `AUD-15` exige justificar la creación o abstención de índices en tablas críticas basándose en el balance de costos entre lecturas y escrituras bajo la política de presupuesto cero:

### Tabla `DemoRequest`:
- **Volumen y admisión:**
  - La admisión está estrictamente acotada por cuota diaria a un máximo de 100 solicitudes por día (`DEMO_POLICY.contactDailyQuota = 100`).
  - La retención física es de 30 días (`DEMO_POLICY.contactRetentionDays = 30`), tras los cuales el mantenimiento diario elimina físicamente los registros expirados.
  - El volumen total activo de la tabla está acotado a $\le 3.000$ filas ($\approx 350\text{ KB}$ en disco).
- **Consultas activas:**
  1. *Inserción/Replay (`submitDemoRequest`):* `INSERT ... ON CONFLICT ("requestId") DO NOTHING`. Utiliza el índice único `DemoRequest_requestId_key`.
  2. *Limpieza diaria de vencidos (`runMaintenanceCleanup`):* `DELETE FROM "DemoRequest" WHERE "expiresAt" <= NOW() LIMIT 100`. Utiliza el índice `DemoRequest_expiresAt_idx`.
  3. *Exportación por lotes (`exportContacts`):* `SELECT ... WHERE createdAt <= $now AND expiresAt > $now ORDER BY createdAt ASC, id ASC LIMIT 500`.
- **Evaluación de índice compuesto `(expiresAt, createdAt, id)` o `(createdAt, id)`:**
  - En una tabla de $\le 3.000$ registros completamente residente en el buffer pool de PostgreSQL, el escaneo filtrado por `expiresAt` con ordenamiento en memoria toma $< 0.1\text{ ms}$.
  - Crear un índice compuesto adicional implicaría penalizar con una actualización de B-tree cada una de las 100 inserciones diarias y cada una de las operaciones de borrado por mantenimiento, aumentando el consumo de almacenamiento y la fragmentación.
  - **Decisión:** Mantener exclusivamente la clave primaria `id`, la restricción única `requestId` y el índice `@@index([expiresAt])`. No se crean índices superfluos para una exportación administrativa que se ejecuta de forma periódica/diaria.

### Tablas `OperationEvent`, `HcsPublication` y `CommandReceipt`:
- Se preservan los índices de clave foránea y unicidad existentes:
  - `CommandReceipt`: `@@unique([runId, requestId])` garantiza idempotencia en $O(1)$.
  - `OperationEvent`: `@@unique([runId, ordinal])` y clave primaria `id`.
  - `HcsPublication`: Clave primaria `eventId` (1:1 con evento), `@@index([state, nextAttemptAt])` y `@@index([leaseExpiresAt])` optimizados para la adquisición de tareas pendientes por el despachador.

---

## 7. Verificación y Pruebas

- **Pruebas de Contratos ([`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts)):**
  - Comprueba que `publicTracePublicationSelect` y `publicTraceEventSelect` excluyen estrictamente `attempts`, `signedTransactionBytes`, `leaseOwner` y `leaseExpiresAt`.
  - Comprueba que `publicVerificationPublicationSelect` agrega únicamente `attempts: { select: { transactionId: true, state: true } }` sin filtrar bytes pesados ni leases.
  - Comprueba que `publicationSummarySelect` excluye `signedTransactionBytes`, `attemptHistory`, `verificationEvidence` y metadatos de lease.
  - Comprueba mediante escenarios parametrizados que el cálculo lineal de bloqueo de hitos (`blockedBy`) produce exactamente el mismo resultado que la formulación cuadrática previa.
- **Pruebas de Integración y Seguridad ([`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts)):**
  - Escenario `S22-22`:
    - Verifica que el replay de un comando POST (`executeOperationCommand`) devuelve `replayed: true` y omite `signedTransactionBytes`, `attemptHistory`, `leaseOwner` y `leaseExpiresAt`.
    - Verifica que la mutación y posterior replay de PATCH (`patchOperationCommand`) devuelve `replayed: true` y omite `signedTransactionBytes`, `attemptHistory` y `leaseOwner`.
    - Verifica que `GET /api/v1/traces/:traceId` omite la tabla `attempts` de los eventos y no expone bytes binarios.
    - Verifica que `GET /api/v1/traces/:traceId/events/:eventId/verification` omite `signedTransactionBytes` y conserva la integridad y evidencia contrastable.
- **Exportación de Contactos ([`tests/api/contactos-y-consulta.test.ts`](../tests/api/contactos-y-consulta.test.ts)):**
  - Escenarios `API-21` y `API-22` validan la exclusión de contactos expirados, el orden determinista, la paginación acotada, el delimitador `;` y el escape estricto de inyecciones de fórmulas.
