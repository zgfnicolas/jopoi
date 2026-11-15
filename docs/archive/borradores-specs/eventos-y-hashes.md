# Eventos, hashes y persistencia atómica

S07 implementa formatos públicos v1 y ejecución privada transaccional en `feature/s07-eventos-y-hashes`, desde `main` con S06 integrada. Reutiliza esquema y triggers sin nuevas migraciones. La única dependencia añadida es `canonicalize` **5.1.0**, fijada exactamente, Apache-2.0 y compatible con Node >=22 según su [manifiesto oficial](https://github.com/erdtman/canonicalize/blob/v5.1.0/package.json). El workspace usa Node 24; no se actualizaron otras versiones del lockfile.

S07 no agrega rutas HTTP ni CLI para ejecutar comandos. Actualización S08: la [API privada del recorrido](api-del-recorrido.md) ya conecta esta capacidad mediante comandos HTTP y recupera historial con hashes. S09/S10 prepararán y enviarán transacciones HCS. S07/S08 no exigen credenciales Hedera ni firman, reservan cuota o contactan la red. Las secciones siguientes conservan la evidencia de cierre de S07.

## Contrato público v1

Los tipos están en `src/shared/event-contracts.ts` y sus schemas estrictos en `src/domain/event-schemas.ts`. `PublicEventRecord` contiene `{ payload, digest }`. Su payload tiene únicamente:

```typescript
{
  version: 1, demo: true, network: "testnet",
  traceId, eventId, ordinal, type, role, appliedAt,
  detail: {
    state, scenarioVersion,
    material: { id, label },
    quantityKg, humidityPercent,
    buyer: { id, name },
    trip: null | { id, label },
    receivedKg: null | string,
    reason: null | { code, label }
  }
}
```

UUID públicos en minúsculas; ordinal entero positivo de rango SQL; appliedAt ISO UTC con milisegundos. Pesos canónicos con tres decimales y humedad con dos. Los campos no aplicables usan null, sin omisiones.

El comprador es el previsto por el snapshot también antes de asignar; estado y viaje distinguen una asignación realizada. Material, comprador, viaje y motivo se construyen seleccionando campos explícitos del snapshot del recorrido, nunca del catálogo vigente ni de objetos completos enviados por visitantes. El motivo incluye código y etiqueta precargados, sin texto libre.

La lista excluye contactos, sesión/hashes, requestId, recibos, IDs internos de propietario/recorrido, precios, fotos, bytes firmados y metadatos de envío. El eventId es un UUID público generado por el servidor; traceId sigue siendo localizador, no autorización.

| Acción | Tipo de evento | Estado | Rol |
| --- | --- | --- | --- |
| save | Ninguno | DRAFT | generator |
| publish | LOT_PUBLISHED | PUBLISHED | generator |
| approve | LOT_APPROVED | APPROVED | coordinator |
| reject | LOT_REJECTED | REJECTED | coordinator |
| assign | TRANSPORT_ASSIGNED | ASSIGNED | coordinator |
| pickup | PICKUP_CONFIRMED | PICKED_UP | carrier |
| receive | RECEIPT_ACCEPTED | RECEIVED | buyer |
| incident | RECEIPT_ISSUE_REPORTED | INCIDENT | buyer |

Se comprueban coherencia entre tipo/rol/estado y presencia de viaje, recepción y motivo. El camino conforme crea cinco hitos; los siete tipos representan alternativas posibles. Los roles se convierten explícitamente entre contrato en minúsculas y enums SQL.

## Canonicalización y hash

JCS de [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) ordena propiedades por unidades UTF-16 recursivamente y serializa sin espacios. Se preservan arrays y Unicode tal como están, sin normalización NFC/NFD. SHA-256 se calcula sobre los bytes UTF-8 y se conserva como 64 caracteres hexadecimales minúsculos. El digest queda fuera del payload del que se calcula.

`canonicalJson` comprueba JSON antes de invocar la biblioteca: rechaza undefined, bigint, funciones, símbolos, NaN/Infinity, ciclos, arrays dispersos o con propiedades adicionales, getters, propiedades no enumerables, instancias Date/clases y strings/claves con surrogates aislados. No permite las omisiones o transformaciones toJSON que un serializador podría aceptar. Los schemas rechazan atributos desconocidos, versiones/redes incorrectas y decimales no canónicos; no recortan ni transforman el evento después de calcular su huella.

SQL conserva el objeto JSONB y su digest. El orden físico de propiedades no forma parte del contrato: se reconstruye mediante JCS. No se añade columna con texto canónico ni se reconstruye un evento histórico desde el estado actual.

`readPublicEvent` valida el payload guardado, recalcula el digest local y contrasta identidad, recorrido, ordinal, versión, tipo, rol e instante con las columnas del evento. Inconsistencias producen error interno sin corregir historia. Este contraste local no representa verificación de Hedera o mirror.

`createHcsEnvelope` construye desde el evento guardado una envoltura con version, demo, network, traceId, eventId, ordinal, type, role y digest, y devuelve sus bytes canónicos UTF-8. Verifica digest y coherencia de rol/tipo; no envía ni firma. S09 comprobará tamaño y una sola unidad HCS.

## Ejecución privada e idempotencia

`executeOperationCommand` es server-only y recibe `{ token?, traceId, requestId, expectedVersion, command }`. S08 tomará token de cookie y traceId de ruta, validará el cuerpo HTTP y construirá esta entrada explícitamente; no se aceptan credenciales o modelos SQL copiados del body.

Los UUID y expectedVersion se validan antes de SQL. Dentro de `withTransaction`, `requireOwnedRun` de S04 autoriza propietario y vigencia antes de recuperar información privada. Se lee el snapshot SQL con un schema estructural estricto, versión coherente e IDs de viajes/motivos inequívocos. No se regenera ni sustituye el snapshot. Los enteros SQL se convierten al contrato canónico de S06.

La función pura `normalizeOperationCommand`, ahora exportada desde S06, comparte normalización sin volver a exigir el estado de origen. La huella de intención es SHA-256 de JCS sobre `{ version: 1, expectedVersion, command: comandoNormalizado }`. requestId es la clave única por recorrido y no integra la huella.

**Confirmado al planificar S07:** 12000 y 12000.000 kg son la misma intención; cambiar expectedVersion con la misma clave produce IDEMPOTENCY_CONFLICT. Rol, acción y datos también integran la intención. El cliente conserva la petición original al reintentar.

El recibo previo se comprueba antes de comparar versión vigente o aplicar otra transición. Si coincide la huella, se recupera el resultado original incluso después de avanzar/cerrar; si difiere, se devuelve IDEMPOTENCY_CONFLICT. Propiedad y vigencia siguen siendo obligatorias.

`CommandReceipt.result` guarda `{ version: 1, operation, eventId }`, y resultingVersion conserva la versión original. Se inserta una vez, sin actualizarlo. Las claves duran con el recorrido hasta S10.

El resultado privado `PersistedCommandResult` separa `replayed`, `applied` —operación/versión/eventId originales—, `current` —operación/versión vigentes—, `event` original y `publication` con estados actuales de envío/verificación. Evento y publicación son null para save. No reutilizar este resultado privado como proyección pública de S11. Se comprueba coherencia entre recibo y evento y se exige publicación cuando hay hito.

## Transacción y pendientes

Para una intención nueva, comprobar expectedVersion y llamar a `decideOperation`. Volver a comprobar vigencia contra el único instante de aplicación antes de escribir. Generar identificadores e insertar recibo, incrementar versión condicionalmente y guardar los cambios operativos en la misma transacción serializable. La asignación guarda assignedAt con ese instante y lo preserva en las acciones siguientes. No cambian identidad, snapshot ni vencimiento.

Para un hito, asignar ordinal mediante máximo existente más uno y crear OperationEvent con HcsPublication asociada. Mantener el trigger de inmutabilidad y restricciones de ordinal, comando/evento y publicación única. Los deletes de retención siguen permitidos.

La publicación inicial tiene red testnet, estado QUEUED, verificación NOT_CHECKED, contadores cero y nextAttemptAt igual a appliedAt. Transacción, bytes, topic, generación de configuración y resultados de consenso quedan sin preparar. Faltar configuración Hedera no impide guardar una acción válida. S09/S10 resolverán preparación, pausa por configuración, cuotas e intentos.

Save genera recibo y avance de versión aun con valores iguales y clave nueva, sin evento ni publicación. Versión de recorrido y ordinal son distintos: publicar tras varios guardados puede producir el evento 1 con versión superior a 2. No se exige continuidad de secuencias HCS por recorrido.

Cualquier excepción revierte recibo, versión, estado, evento y pendiente. Ante unicidad/serialización, después del rollback una transacción nueva vuelve a autorizar y solo intenta leer el recibo: recuperarlo si existe; si falta, VERSION_CONFLICT. No se repiten escrituras automáticamente. Ante timeout SQL de resultado incierto, el cliente reintenta con la misma clave para resolver si hubo commit.

## Verificación y pendientes

Pasaron TypeScript, validación Prisma, generación durante build y compilación Next.js con los cuatro paths existentes de S04/S05. Revisión estática de listas públicas, imports, escrituras agrupadas y restricciones existentes. canonicalize se instaló sin ejecutar scripts de instalación y sin actualizar otros paquetes del lockfile.

No se inició PostgreSQL, aplicaron migraciones ni ejecutaron comandos operativos; no se crearon eventos/pendientes de negocio, transacciones testnet o despliegues. La compilación acredita preparación de código, no atomicidad observada de esta capacidad todavía sin endpoint.

No se crearon ni ejecutaron suites. Para S17 mediante la API de S08: cinco hitos conformes y alternativas; save sin eventos; ordinal/versiones; reintentos después de avanzar/cerrar, normalización equivalente y versión distinta; carreras y rollback sin huérfanos; vectores JCS/SHA-256 independientes, Unicode y entradas inválidas; JSONB reproducible; alteración del detalle; inmutabilidad SQL; privacidad; y persistencia sin Hedera configurada. S18 cubrirá su explicación y la integración real de testnet al estar disponibles S09–S16.
