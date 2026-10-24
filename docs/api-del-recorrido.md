# API privada del recorrido

S08 implementa recuperación y comandos HTTP en `feature/s08-api-del-recorrido`, desde `main` con S07 integrada mediante PR #6. Reutiliza reglas de S06, transacciones/recibos/eventos de S07 y sesión de S04. No añade dependencias, variables de entorno ni migraciones.

Actualización S09/S10: [el adaptador HCS](hedera-testnet.md) amplía publication con network, topicId, transactionId, sequenceNumber como string, consensusTimestamp, confirmedAt, verifiedAt y lastErrorCode categorizado; los ausentes son null. El primer hito puede fijar metadata privada de generación sin exigir clave ni contactar red. [S10](cuotas-reintentos-y-mantenimiento.md) activa trabajo posterior a la respuesta SQL y añade intentos, elegibilidad, bloqueo por predecesor y cuota al resumen privado, además del POST privado de reintento. Las secciones siguientes conservan el contrato y la evidencia de cierre de S08.

## Acceso y recuperación

S14 conecta el [panel operativo guiado](panel-operativo-guiado.md) con estas rutas sin cambiar sus contratos. El cliente captura intención/versión, distingue confirmación SQL de red y refresca el detalle después de escribir; las verificaciones de comportamiento siguen en S17/S18.

S11 incorpora una [API pública separada](api-publica-de-trazabilidad.md), sin cookie ni permisos operativos. Sus DTO no reutilizan los contadores/cuotas del resumen privado; este documento sigue describiendo exclusivamente el acceso privado de S08.

Todos los endpoints usan Node.js y la cookie HttpOnly `jopoi_session`. El token nunca se recibe en el cuerpo. Las respuestas correctas y los errores de aplicación llevan `Cache-Control: private, no-store` y `Vary: Cookie`; no se habilita CORS.

| Endpoint | Respuesta correcta |
| --- | --- |
| `GET /api/demo/runs/current` | `200`, `{ session, run }`; el vigente con mayor ordinal, o `run: null` si aún no existe. |
| `GET /api/demo/runs/{traceId}` | `200`, `{ session, run }` para el recorrido propio solicitado; también permite recuperar uno anterior a un reinicio. |
| `POST /api/demo/runs/{traceId}/commands` | `200` tanto para una acción nueva guardada como para su repetición idempotente. |

Se confirma el contrato de recuperación con `run: null`, sin creación implícita. Primero se inicia explícitamente la sesión mediante S04; `POST /api/demo/runs` inicia/retoma y `POST /api/demo/runs/reset` crea otro dentro del cupo. GET no renueva sesión ni crea recorridos, recibos, eventos, envíos o reintentos.

`session` reutiliza `{ expiresAt, runCount, remainingRuns }`. `run`, cuando existe, contiene:

```typescript
{
  traceId, version, expiresAt,
  operation: {
    state, quantityKg, humidityPercent,
    assignedBuyerId, assignedTripId, receivedKg,
    rejectionReasonCode, incidentReasonCode
  },
  scenario,      // snapshot persistido completo, con evidencia y datos ficticios
  compatibility, // viajes y sus cinco comprobaciones explicadas
  economics,    // importes ilustrativos, moneda y advertencia de S02
  events: [{ event: { payload, digest }, publication: { state, verificationState } }]
}
```

Se confirmó historial completo, ordenado por ordinal ascendente. El flujo actual tiene como máximo cinco hitos; no hay paginación. Un borrador sin publicaciones tiene `events: []`. Cada payload se valida y su digest se contrasta localmente con S07; esto no constituye comprobación de red.

La autorización, lectura de recorrido e historial se realizan en una misma transacción serializable. Se comprueba nuevamente el vencimiento antes de devolver el resultado. El escenario procede exclusivamente del snapshot SQL, no del catálogo actual. Compatibilidad y economía se calculan con la cantidad declarada vigente y ese snapshot, incluso después de un terminal. El peso recibido no sustituye la declaración para el cálculo.

Los contratos están en `src/shared/run-contracts.ts`. Esta respuesta privada no es la proyección pública de S11. No contiene IDs internos de sesión/recorrido/recibo, token, hashes de credencial/intención, bytes firmados, leases o errores de proveedores. Del registro de publicación se seleccionan únicamente sus dos estados.

## Comandos

POST exige `Origin` exactamente igual a `APP_URL`, `X-Jopoi-Request: demo` y `Content-Type: application/json`. El origen no se infiere de Host. El lector limita a **4096 bytes** el stream, incluso sin Content-Length. JSON inválido, UTF-8 inválido, exceso de tamaño, campos adicionales y tipos incorrectos producen `INVALID_INPUT`.

El cuerpo es plano. Todos los comandos llevan UUID `requestId`, `expectedVersion` entero entre 1 y 2147483647, `role` y `action`. Los UUID se normalizan a minúsculas. Rol y acción distinguen mayúsculas; el rol es simulado, sin firma empresarial independiente.

| Acción | Campos adicionales exactos | Rol correspondiente |
| --- | --- | --- |
| `save`, `publish` | `quantityKg`, `humidityPercent` | `generator` |
| `approve` | Ninguno | `coordinator` |
| `reject` | `reasonCode` | `coordinator` |
| `assign` | `tripId` | `coordinator` |
| `pickup` | Ninguno | `carrier` |
| `receive` | `receivedKg` | `buyer` |
| `incident` | `receivedKg`, `reasonCode` | `buyer` |

Ejemplo de cuerpo de publicación para un recorrido en versión 1:

```json
{
  "requestId": "6ff94b2d-2a08-4272-8b62-70c3399f54a0",
  "expectedVersion": 1,
  "role": "generator",
  "action": "publish",
  "quantityKg": "12000.000",
  "humidityPercent": "28.00"
}
```

Las cantidades viajan como strings positivas con hasta tres decimales; la humedad, como string entre 0 y 100 con hasta dos. No se convierten números JSON a strings ni se redondea precisión excesiva. Viajes y motivos se validan contra el snapshot autorizado. S06/S07 conservan normalización y reglas; el adaptador HTTP no decide transiciones ni escribe SQL directamente.

El resultado tiene `{ saved: true, traceId, replayed, applied, current, event, publication }`:

- `saved` afirma persistencia SQL, también al recuperar un resultado ya guardado.
- `applied` contiene `{ operation, version, eventId }` originales de la intención.
- `current` contiene `{ operation, version }` vigentes en la transacción que resolvió la petición; puede ser posterior a `applied`.
- `event` es el `{ payload, digest }` original, o `null` para `save`.
- `publication` conserva los estados actuales de envío y verificación de ese hito; es `null` para `save`.

El cliente conserva el mismo requestId y cuerpo completo al reintentar tras timeout. Como se confirmó en S07, `12000` y `12000.000` son equivalentes; cambiar expectedVersion con la misma clave cambia la intención y devuelve conflicto. Una repetición válida puede recuperar su resultado después de avanzar o cerrar el recorrido. La propiedad y vigencia siguen siendo obligatorias. Una intención nueva con versión antigua no escribe nada.

No se hace una lectura adicional después del commit para construir el resultado HTTP: se conserva el resultado coherente de S07, evitando presentar un fallo posterior de lectura como si el comando no se hubiera guardado. Para refrescar escenario, compatibilidad, economía e historial se usa GET.

## Errores y límites

Se reutiliza `{ error: { code, message, requestId, fields? } }` de S01, con identificador diagnóstico generado por servidor. No se serializan excepciones, atributos desconocidos aportados por el visitante ni valores de credenciales.

| Estado | Códigos relevantes |
| --- | --- |
| 400 | `INVALID_INPUT`: ruta UUID, JSON, forma o datos inválidos. |
| 401 | `SESSION_REQUIRED`, `SESSION_EXPIRED`. |
| 403 | `REQUEST_FORBIDDEN`, `WRONG_ROLE`. |
| 404 | `NOT_FOUND`: recorrido ajeno, inexistente o vencido; no se revela cuál de ellos. |
| 409 | `STATE_CONFLICT`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`. |
| 422 | `RULE_VIOLATION`: humedad, transporte o recepción incompatibles. |
| 503 | `DATABASE_UNAVAILABLE`, `CONFIGURATION_UNAVAILABLE`. |
| 500 | `INTERNAL_ERROR`, incluyendo evidencia persistida inconsistente. |

Ante conflicto el cliente refresca el estado antes de proponer una intención nueva. El servidor no repite escrituras automáticamente ni crea sesiones de reemplazo. Las cuotas de recorridos siguen en S04; la coordinación de cuota HCS y reintentos pertenece a S10.

Los hitos nuevos quedan `QUEUED` / `NOT_CHECKED`, incluso si faltan credenciales Hedera. S08 no importa el SDK, reserva cuota, prepara transacciones ni afirma consenso. El adaptador y el envío corresponden a S09/S10. No hay UI, endpoint público de trazabilidad ni despliegue en esta entrega.

## Verificación

Pasaron TypeScript, validación Prisma y build de producción, incluyendo generación Prisma y las tres rutas nuevas. La revisión estática comprobó adaptación estricta HTTP, autorización transaccional, proyección explícita y ausencia de cambios en esquema, migraciones o ejecución de comandos de S07. La compilación no acredita todavía el comportamiento HTTP ni la atomicidad observada.

No se inició PostgreSQL, aplicaron migraciones ni ejecutaron comandos de negocio para esta comprobación. No hubo envíos HCS, despliegues, nuevos recursos externos ni commit. No se crearon ni ejecutaron suites antes de S17/S18.

Casos pendientes para S17 mediante HTTP: recuperación nula y posterior al reinicio; tres ramas; guardados sin hitos; roles, formatos y campos extra; aislamiento y vencimiento; decimales equivalentes y expectedVersion distinto con la misma clave; repetición después de avanzar/cerrar; concurrencia; ausencia de efectos parciales; historial ordenado y hashes; economía y compatibilidad recalculadas; persistencia sin Hedera y ausencia de secretos. S18 cubrirá el recorrido en navegador y su explicación.
