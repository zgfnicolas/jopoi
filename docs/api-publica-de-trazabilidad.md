# S11 · API pública de trazabilidad y verificación

Implementada en `feature/s11-api-publica-de-trazabilidad`, desde `main` con S10 integrado mediante PR #9. Las consultas son públicas y de solo lectura: no leen cookies, crean sesiones, modifican SQL, toman leases ni registran trabajo de S10. No necesitan claves Hedera, `SESSION_SECRET`, `CRON_SECRET` ni `APP_URL`; SQL sigue siendo necesario.

## Historial público

```text
GET /api/traces/{traceId}
```

El contrato `PublicTraceResponse` tiene `version: 1`, `demo: true`, `network: "testnet"`, `traceId`, `expiresAt`, `state`, `scenario`, `declaration`, `reception` y `events`.

- `scenario` selecciona versión, aviso ilustrativo, material, generador/comprador ficticios y ruta del snapshot original. El viaje seleccionado incluye solo ID, etiqueta y transportista ficticio; antes de asignar es null. No expone precios, capacidades, requisitos, catálogo de viajes, fotos ni snapshot completo.
- En `DRAFT`, la declaración y recepción son null y los eventos están vacíos. Cantidad y humedad todavía editables permanecen privadas. Se mantiene el contexto ficticio mínimo acordado.
- `declaration` procede del evento íntegro `LOT_PUBLISHED`: eventId, quantityKg y humidityPercent. `reception` procede de `RECEIPT_ACCEPTED` o `RECEIPT_ISSUE_REPORTED`: eventId, outcome RECEIVED/INCIDENT, receivedKg y motivo precargado cuando corresponde. No se reconstruyen desde datos actuales ni se presentan como certificación física.
- Los eventos se ordenan por ordinal. Cada uno incluye eventId, ordinal, type, role simulado, appliedAt, payloadVersion, event, integrity, publication, storedVerification y links.

`event` conserva `{payload, digest}` de S07 cuando supera formato, identidad y contraste JCS/SHA-256. `integrity` informa MATCHED/MISMATCH, storedDigest y localDigest. Los digests malformados o imposibles de calcular se representan con null. MATCHED aquí significa integridad local, no comprobación de red.

Ante un detalle inconsistente, ese hito conserva sus metadatos pero devuelve `event: null` e integridad MISMATCH. El resto del historial sigue disponible. Si el hito sostiene declaración o recepción, esa sección superior queda en null; no se reemplaza con otra fuente para aparentar integridad. Las lecturas privadas de S07 mantienen su comportamiento estricto.

`publication` selecciona únicamente state, network, topicId, transactionId, sequenceNumber como string, consensusTimestamp, confirmedAt y lastErrorCode del catálogo seguro HCS. No se reutiliza `PublicationSummary` privado: quedan fuera cuota, contadores, autorización manual, próximo intento, leases, generación interna, bytes, recibos e historia técnica. Tampoco se recuperan contactos, tokens o relaciones de sesión.

`storedVerification` tiene state, verifiedAt y evidencia histórica validada. Un MATCHED histórico exige evidencia válida ligada al transactionId, topic y digest guardados. Evidencia inválida no se presenta como coincidencia y el estado proyectado pasa a UNAVAILABLE sin escribir SQL. La evidencia histórica conserva su propio observedAt, que puede ser anterior a verifiedAt si S10 conservó una observación previa tras una lectura fallida.

Este GET consulta exclusivamente SQL. No contacta mirror ni exige que la sesión propietaria siga vigente: la consulta pública dura hasta el vencimiento operativo de siete días.

## Contraste remoto explícito

```text
GET /api/traces/{traceId}/events/{eventId}/verification
```

`PublicTraceVerificationResponse` devuelve version, demo, network, traceId, eventId, expiresAt, payloadVersion, state actual, integrity, publication guardada, storedVerification histórica, observation actual y links.

La observación es transitoria y nunca se guarda en SQL. Solo se consulta mirror cuando el evento es íntegro y el transactionId actual coincide con un intento registrado STARTED, UNCERTAIN, REJECTED o CONFIRMED. Un ID preparado sin intento que pudo enviarse no activa lectura remota.

| Situación | Respuesta actual |
| --- | --- |
| Integridad local discrepante | MISMATCH y observation null; no se consulta la red. |
| Sin intento verificable | NOT_CHECKED y observation null. |
| Lectura remota pendiente o ausente según S09 | PENDING con observación de lectura. |
| Mensaje e identificadores coincidentes | MATCHED con digest remoto y evidencia. |
| Mensaje o identificadores diferentes | MISMATCH sin corregir el payload original. |
| Mirror indisponible o evidencia histórica ya ausente | UNAVAILABLE; se conserva separada la confirmación SQL. |

La observación contiene state, código categorizado y evidencia: versión, observedAt, topicId, transactionId, sequenceNumber, consensusTimestamp, localDigest, remoteDigest, identifiersMatch y digestMatch. Los campos no observados son null; los booleanos nunca inventan coincidencia.

Se reutiliza directamente el lector mirror de S09, sin cargar el proveedor de firma ni el SDK. Cada consulta hace como máximo dos GET remotos: transacción y mensaje por timestamp. Cada solicitud tiene timeout de tres segundos, `no-store`, rechazo de redirects y límites de 256 KiB/64 KiB, respectivamente. No hay paginación, reintentos automáticos ni polling. El handler tiene `maxDuration = 30`.

Un resultado MATCHED remoto puede coexistir con publicación SQL UNCERTAIN: la consulta observó evidencia actual y no reconcilió ni modificó el estado del trabajador. A la inversa, un MATCHED histórico no sustituye una observación actual UNAVAILABLE. Un receipt exitoso con mirror pendiente conserva CONFIRMED sin afirmar coincidencia.

La red se consulta fuera de la transacción SQL. Después se vuelve a comprobar recorrido, evento, vencimiento y preparación. Si se borraron, se devuelve 404; si venció, 410; si cambiaron transactionId, topic, digests o versión del payload, VERSION_CONFLICT/409 para refrescar. El proceso no devuelve como vigente una observación de otra preparación.

## URLs, caducidad y errores

Ambas rutas usan Node.js, renderizado dinámico y `Cache-Control: no-store`, también en errores. No requieren Origin, header CSRF o cookie ni habilitan CORS. No hay respuesta compartida en caché que prolongue la disponibilidad de un recorrido vencido.

Los UUID se validan y normalizan antes de SQL. Se comprueba el vencimiento antes de construir el DTO y nuevamente antes de devolverlo. Se conserva el formato `{error:{code,message,requestId,fields?}}`:

| Estado HTTP | Caso |
| --- | --- |
| 200 | Consulta válida, incluidos pendiente, discrepancia o mirror indisponible. |
| 400 INVALID_INPUT | UUID inválido. |
| 404 NOT_FOUND | Recorrido inexistente/borrado, evento inexistente o de otro recorrido; sin hitos públicos en DRAFT. |
| 410 TRACE_EXPIRED | Recorrido conocido que ya venció. |
| 409 VERSION_CONFLICT | Preparación o detalle cambió durante el contraste. |
| 503 DATABASE_UNAVAILABLE | Configuración SQL ausente o dependencia SQL indisponible. |
| 500 INTERNAL_ERROR | Inconsistencia estructural inesperada, sin exponer excepciones. |

No se crean tombstones ni se reconstruye información borrada consultando HCS. El identificador público sigue siendo un localizador, sin permiso de escritura.

`links` tiene transaction, topic y message, con null cuando falta referencia. Las URLs HTTPS se construyen exclusivamente bajo `https://testnet.mirrornode.hedera.com/api/v1`, desde IDs/timestamps validados. La referencia al mensaje usa el timestamp guardado o uno observado con identidad coincidente. No se aceptan destinos del visitante ni URLs del proveedor. Referencias oficiales: [transacciones](https://docs.hedera.com/reference/rest-api/transactions) y [mensaje por timestamp](https://docs.hedera.com/api-reference/topics/get-topic-message-by-consensustimestamp).

## Verificación y pendientes

Se comprobaron TypeScript, validación Prisma, build de producción y diff. S11 añade dos rutas a las nueve existentes, sin migraciones, dependencias ni variables de entorno. Las cuatro migraciones de S03/S04/S09/S10 permanecen intactas. No se inició PostgreSQL, generaron datos de negocio, ejecutó mantenimiento, contactó testnet ni se desplegó o creó commit durante esta entrega.

No se crearon ni ejecutaron suites. S17 verificará a través de API: ausencia de cookie/secretos, borrador mínimo, cinco hitos y terminales alternativos, campos excluidos, evento ajeno, hash reproducible y detalle alterado, evidencia histórica inválida, receipt con mirror pendiente, coincidencia/discrepancia, timeout/404/reset, reemplazo concurrente, expiración durante la red, limpieza concurrente y ausencia de mensajes, cuotas o escrituras por consulta. S18 cubrirá página/QR de S15 y comprobación real de testnet separada.
