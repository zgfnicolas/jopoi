# Reglas de operación y compatibilidad

S06 implementa el dominio del recorrido en `feature/s06-reglas-de-operacion`, desde `main` con S05 integrada. Aporta decisiones puras y resultados explicados; las escrituras SQL, recibos idempotentes, evidencia y API de comandos se integrarán en S07/S08. No añade endpoints, migraciones, dependencias ni operaciones Hedera.

Actualización S07: la [ejecución transaccional y los eventos](eventos-y-hashes.md) ya utilizan las decisiones de S06. Se exporta `normalizeOperationCommand` para compartir la normalización antes del recibo, sin exigir nuevamente el estado de origen. La API y las pruebas siguen pendientes de S08 y S17/S18. Las descripciones siguientes conservan el alcance original de S06.

## Interfaz y datos

Los tipos compartidos están en `src/shared/operation-contracts.ts`: `OperationState`, `SimulatedRole`, `OperationCommand`, `OperationData`, `OperationDecision`, `TripCondition`, `TripCompatibilityCheck` y `TripCompatibility`. El resumen de sesión de S04 utiliza el mismo `OperationState`, conservando su JSON.

Las dos operaciones principales son:

| Función | Entrada y resultado |
| --- | --- |
| `decideOperation(operation, command, snapshot)` | Estado operativo tipado, comando y snapshot persistido; devuelve `OperationResult<OperationDecision>`. |
| `evaluateTripCompatibility(quantityKg, snapshot)` | Cantidad declarada vigente y snapshot; devuelve `DomainResult<readonly TripCompatibility[]>` en el orden original de los viajes. |

`OperationData` contiene estado, `quantityKg`, `humidityPercent`, `assignedBuyerId`, `assignedTripId`, `receivedKg`, `rejectionReasonCode` e `incidentReasonCode`. Los campos todavía no aplicables se representan como `null`. No contiene sesión, IDs internos de SQL, versión SQL, fechas, requestId, datos personales ni metadatos de publicación.

La decisión es `{ operation, createsMilestone }`. La nueva operación se normaliza y congela, y no comparte estructuras mutables con la entrada. `createsMilestone` representa el significado de la acción; no afirma que se guardó SQL, que existe un evento ni que hubo consenso. Guardar borrador devuelve `false`; los otros siete comandos devuelven `true` cuando son válidos.

El dominio recibe siempre el snapshot del recorrido. No importa el catálogo vigente ni lo regenera; usa sus propios requisitos, viajes, comprador y motivos. El llamador entrega objetos tipados: S07/S08 convertirán el JSON SQL a ese contrato y S08 rechazará forma HTTP y atributos desconocidos. Aquí se validan valores decimales, IDs/motivos contra catálogo y reglas de operación. Los resultados no mutan entradas ni snapshot, y son serializables: todos los decimales salen como cadenas, sin bigint o Date.

## Máquina de estados y roles

| Acción | Rol simulado | Estado de origen | Resultado | Datos propios del comando |
| --- | --- | --- | --- | --- |
| `save` | `generator` | DRAFT | DRAFT | `quantityKg`, `humidityPercent` |
| `publish` | `generator` | DRAFT | PUBLISHED | `quantityKg`, `humidityPercent` |
| `approve` | `coordinator` | PUBLISHED | APPROVED | Ninguno |
| `reject` | `coordinator` | PUBLISHED | REJECTED | `reasonCode` |
| `assign` | `coordinator` | APPROVED | ASSIGNED | `tripId` |
| `pickup` | `carrier` | ASSIGNED | PICKED_UP | Ninguno |
| `receive` | `buyer` | PICKED_UP | RECEIVED | `receivedKg` |
| `incident` | `buyer` | PICKED_UP | INCIDENT | `receivedKg`, `reasonCode` |

Cada comando incluye `action` y `role`. Publicar decide simultáneamente los nuevos valores y el estado PUBLISHED; un fallo no produce una operación parcialmente modificada. Save y publish solo existen en DRAFT. Las decisiones posteriores conservan la declaración publicada.

RECEIVED, REJECTED e INCIDENT son terminales y no admiten ninguno de estos comandos. Iniciar otra exploración pertenece a S04; no se vuelve a DRAFT ni se corrigen eventos anteriores. La repetición idempotente de un comando ya persistido se resolverá mediante el recibo de S07/S08 antes de intentar una transición nueva.

La validación comprueba datos del comando, rol requerido, estado de origen, consistencia del estado actual y reglas particulares. Una entrada mal formada puede devolver INVALID_INPUT antes que un error de rol/estado. Con entrada válida, un rol equivocado devuelve WRONG_ROLE antes de comprobar la transición. Los estados asignado/retirado exigen comprador del snapshot y viaje existente; los estados anteriores deben carecer de asignación. Un estado no terminal no puede traer pesos recibidos ni motivos de cierre previamente guardados.

El rol es representado, no autenticado de manera independiente. El dominio no concede propiedad ni evalúa vencimiento: la integración reutilizará las guardas de S04 dentro de la misma transacción que la escritura.

## Cantidades, humedad y motivos

Cantidades y peso recibido son positivos, admiten hasta tres decimales y respetan el máximo de S03: `9223372036854775807` gramos, equivalente a `9223372036854775.807` kg. El helper puro `parseOperationQuantityGrams` centraliza ese rango y `toStoredGrams` de S03 delega en él, manteniendo su interfaz y errores.

Los helpers generales de S02, como `parseQuantityGrams` y `normalizeQuantityKg`, conservan su comportamiento. La humedad usa `parseHumidityHundredths` en enteros exactos; `normalizeHumidityPercent` conserva su interfaz. El rango permitido sigue siendo 0–100% inclusive, con hasta dos decimales. Se rechazan signos, exponentes, separadores locales, espacios y precisión adicional, incluso ceros finales; no hay redondeo de pesos/humedad ni conversión de gramos a Number.

Se puede publicar humedad alta, siempre dentro de 0–100%. Aprobar exige no superar el máximo del comprador: en chips-v1, `35.00` permite aprobar y `35.01` produce RULE_VIOLATION. El rechazo exige un motivo de `snapshot.rejectionReasons`.

**Decisión confirmada al planificar S06:** `HUMIDITY_ABOVE_LIMIT` solo puede elegirse si realmente se supera el máximo. `MATERIAL_NOT_AS_DECLARED` permanece disponible como declaración ficticia del coordinador, también con humedad admisible; no representa inspección física realizada por la aplicación.

La recepción conforme compara gramos enteros: cualquier diferencia, incluso `0.001` kg, requiere incidencia. El peso recibido se conserva separado del declarado. `WEIGHT_MISMATCH` solo se admite si hay diferencia; `MATERIAL_ISSUE` admite pesos iguales o distintos. Los motivos deben pertenecer a `snapshot.incidentReasons`. No se aceptan motivos libres ni se modifica retroactivamente la declaración.

La tolerancia cero es una simplificación explícita de esta demo, no un estándar industrial.

## Compatibilidad de viajes

Cada resultado tiene `{ tripId, isCompatible, checks }`. Sus cinco comprobaciones mantienen códigos y orden estables; cada una incluye `{ code, isCompatible, message }` con explicación en español:

| Código | Condición |
| --- | --- |
| MATERIAL | El material está admitido por comprador y viaje del snapshot. |
| CAPACITY | La disponibilidad declarada del viaje es mayor o igual al peso del lote. |
| BODY_TYPE | La carrocería pertenece a las admitidas por el escenario. |
| ROUTE | `routeCompatible` es verdadero y el identificador coincide con el corredor del snapshot. |
| PICKUP_WINDOW | Las ventanas de retiro comparten un intervalo de duración positiva. |

Se evalúan todas las condiciones, sin detener la explicación en el primer incumplimiento. La asignación llama a esta misma evaluación y exige las cinco condiciones; si falla, devuelve RULE_VIOLATION con las explicaciones incumplidas bajo `fields.tripId`. Un viaje desconocido es INVALID_INPUT.

La capacidad disponible puede ser cero, y se compara con bigint; no se deduce de `isReturnTrip`, movimiento o una supuesta caja vacía. El indicador de retorno no constituye una sexta condición. No hay ranking, GPS, división de lote ni consolidación.

**Decisión confirmada al planificar S06:** basta un solapamiento parcial de duración positiva. Para una ventana de lote 08:00–10:00, un viaje 09:00–11:00 es compatible por horario; 10:00–12:00 no lo es. La demo no calcula duración de carga ni requiere cubrir toda la ventana.

Se consideran día ilustrativo y offset fijo UTC−03:00, sin consultar el reloj real. Los intervalos usan dayOffset entero seguro no negativo, minutos enteros con `0 <= startMinute < endMinute <= 1440` y el offset del escenario. Las ventanas inválidas se rechazan; no se corrigen silenciosamente ni se introduce una interpretación de cruce de medianoche. El eje de comparación se calcula con enteros bigint.

Con la semilla original y 12.000 kg, Retorno A satisface las cinco condiciones; Viaje B incumple capacidad, carrocería y horario. Con 18.000 kg Retorno A aún tiene capacidad; con 18.000,001 kg ninguno de los dos tiene suficiente. Editar la cantidad cambia la evaluación sin tocar `snapshot.initialLot`.

## Errores e integración posterior

Los resultados usan `{ ok: true, value }` o `{ ok: false, error: { code, fields } }`. `DomainResult`/`DomainFailure` admiten un parámetro de código cuyo valor predeterminado conserva INVALID_INPUT/RULE_VIOLATION de S02; `OperationResult` añade WRONG_ROLE/STATE_CONFLICT. No se lanza `ApplicationError` ni se importa un adaptador HTTP desde el dominio.

| Código | Causa | Estado HTTP al integrar con S01 |
| --- | --- | --- |
| INVALID_INPUT | Forma/precisión decimal inválida, rol/acción no reconocidos, viaje/motivo desconocido o valores de ventana inválidos. | 400 |
| WRONG_ROLE | Rol simulado válido que no corresponde a la acción. | 403 |
| STATE_CONFLICT | Transición fuera de secuencia/terminal o asignación/cierre incoherente con el estado actual. | 409 |
| RULE_VIOLATION | Cantidad no positiva/fuera de rango, humedad fuera de rango/requisito, viaje incompatible o motivo/peso incoherentes. | 422 |

S07/S08 mapearán OperationData a las columnas SQL, preservarán snapshot y declaración publicada, y agruparán versión, recibo, evento y pendiente en una transacción. La asignación devolverá IDs de comprador/viaje; el adaptador añadirá `assignedAt` usando el instante de aplicación para satisfacer la restricción SQL de S03. Los identificadores de evento, ordinales, fechas, canonicalización, hash y metadatos de red pertenecen a esas etapas.

## Verificación y pendientes

Durante S06 pasaron TypeScript, validación Prisma y build de Next.js con las rutas existentes de S04/S05. La revisión estática comprueba que dominio/contratos no importan servidor, ORM, Next.js, configuración, reloj o red, y que no cambian schema, migraciones, catálogo, fórmulas de S02 ni dependencias. No se inició PostgreSQL ni se ejecutaron comandos operativos, escrituras, eventos o testnet.

No se crearon ni ejecutaron suites. Las pruebas de comportamiento quedan para S17 mediante la API de S08 y S18 para su comprensión en pantalla. Casos pendientes: camino conforme; rechazo/incidencia; roles, secuencia y terminales; publicación con cambios/humedad alta; límites 35/35,01%; motivos incoherentes; cada condición de transporte fallando sola; capacidad exacta y exceso de un gramo; solapamiento parcial/extremos/días; cero capacidad; precisión y máximo de almacenamiento; peso distinto sin sobrescribir declaración; snapshots históricos e inmutabilidad; y regresión de S04/S05 al integrar el dominio.
