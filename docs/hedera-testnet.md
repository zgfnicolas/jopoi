# Adaptador HCS y verificación en testnet

S09 se implementa en `feature/s09-hedera-testnet`, desde `main` con S08 integrada mediante PR #7. Añade capacidades privadas de preparación durable, envío acotado, reconciliación y contraste de mensajes. S10 conectará esas capacidades con interacción, cuotas, leases, reintentos y mantenimiento. Las rutas de S08 siguen guardando SQL y creando pendientes; no disparan envíos todavía.

## SDK y configuración

Se sustituye `@hashgraph/sdk` 2.81.0 por **`@hiero-ledger/sdk` 2.90.1**, fijado exactamente en manifiesto y lockfile. El paquete y su requisito Node >=18 se comprobaron en npm; el workspace usa Node 24. El [repositorio oficial](https://github.com/hiero-ledger/hiero-sdk-js) recomienda el namespace Hiero. La actualización cambia las dependencias transitivas del SDK; no se solicitan actualizaciones generales del proyecto.

El SDK solo se usa en módulos privados Node. Importar configuración, tipos o rutas no crea clientes ni contacta la red. Cada operación abre exclusivamente `Client.forTestnet()` y lo cierra en `finally`. No hay selector de red, mainnet, URLs del visitante, wallets, HTS, suscripciones permanentes ni proceso residente.

| Variable | Contrato |
| --- | --- |
| `HEDERA_OPERATOR_ID` | Cuenta numérica `0.0.N`, máximo 64 caracteres. |
| `HEDERA_OPERATOR_KEY` | DER hexadecimal canónico de ED25519 o ECDSA; máximo 512 caracteres. No admite claves crudas ambiguas. Se valida con `PrivateKey.fromStringDer`. |
| `HEDERA_TOPIC_ID` | Topic numérico `0.0.N`, máximo 64 caracteres. |
| `HCS_CONFIGURATION_GENERATION` | Etiqueta explícita de 1–64 caracteres alfanuméricos, `_` o `-`; renovar después de reset o cambio de destino. |
| `HCS_DAILY_LIMIT` | Sigue entre 1 y 100. La reserva y aplicación efectiva corresponden a S10. |

`hederaTarget()` lee metadata sin necesitar clave; `hederaOperator()` permite preparar el topic sin exigir un topic preexistente; `hedera()` conserva la capacidad completa incluyendo cuota. Las capacidades son lazy. La validación de forma de configuración no acredita existencia, saldo o conectividad.

Solo se aceptan cuentas de operador con una clave pública simple coincidente con la DER; claves de cuenta en listas o umbrales quedan fuera de esta versión. La preparación de mensajes consulta operador y topic, exige submitKey coincidente, ausencia de tarifas personalizadas y ausencia de feeScheduleKey. Las consultas ocurren fuera de transacciones SQL y consumen exclusivamente saldo ficticio cuando corresponda.

## Generación fija por recorrido

Se confirmó fijar generación, topic y operador al publicar el primer hito cuando exista metadata válida, aunque todavía falte la clave de firma. Si falta metadata, la acción SQL sigue guardándose y la vinculación podrá establecerse al preparar su primer envío. Después no puede cambiarse.

La identidad almacenada es SHA-256 de JCS sobre `{ version: 1, network, generationLabel, operatorId, topicId }`. No incluye clave, límites de cuota, sesión ni información de contacto. Cambiar destino incluso reutilizando por error una etiqueta produce otra identidad y no traslada un recorrido ya vinculado.

La migración `202610230002_hcs_binding` añade al recorrido `hcsConfigurationGeneration`, `hcsTopicId` y `hcsOperatorId`, completos conjuntamente o todos nulos; un trigger protege la vinculación una vez fijada. Añade también `HcsPublication.verificationEvidence`, JSONB opcional. No modifica snapshots, payloads de eventos ni su digest. La vinculación técnica tampoco consume una versión operativa.

Los recorridos anteriores sin preparación quedan sin vincular. La migración se detiene si encuentra transacciones preparadas inesperadas anteriores a S09; no inventa su procedencia ni las reasigna.

## Preparación y envío durable

`createPublicationService` es una entrada server-only, sin endpoint nuevo. Su frontera externa `HcsProvider` separa `prepare`, `submit`, `reconcile` y `verify`; S17 podrá sustituir ese proveedor sin reemplazar SQL o reglas del dominio.

1. Leer evento, publicación y recorrido vigente; comprobar payload y digest con S07.
2. Fijar o recuperar la configuración del recorrido en SQL. Una configuración actual distinta pausa la preparación de hitos nuevos.
3. Fuera de SQL, consultar requisitos del operador/topic, construir la envoltura canónica, preparar y firmar. Máximo 1024 bytes, `setChunkSize(1024)`, `setMaxChunks(1)` y una sola unidad. El [límite oficial de HCS](https://docs.hedera.com/native/consensus/submit-message) impide publicar el detalle completo como varios mensajes no contemplados.
4. Usar transactionId explícito, validez de 120 segundos, regeneración automática desactivada, un nodo por transacción y un intento SDK. Persistir bytes firmados, transactionId, topic, red y generación antes del envío. Un candidato que pierde la carrera se descarta y recupera el ganador; no se envía desde la preparación.
5. Para enviar, recuperar exclusivamente esa preparación de SQL y comprobar tipo, ID, payer, topic, mensaje, firma, unidad y límite de fee. El cliente de envío no tiene operador configurado: no añade firmas ni reemplaza los bytes guardados.

`submit(eventId, leaseOwner)` exige un lease SQL vigente, estado `IN_FLIGHT` y contador de intento ya reservado por el coordinador de S10. S09 no reserva cuotas ni crea leases; no hay ruta o CLI para publicar eventos que saltee esa coordinación. S10 debe reservar cupo y tomar lease atómicamente antes de invocarlo.

Antes del contacto externo se guarda un marcador durable `SUBMISSION_STARTED` con transactionId y fecha en `attemptHistory`. Si ya existe un marcador para ese ID, la invocación solo reconcilia, también cuando el proceso anterior pudo caer justo antes de contactar la red. Se prioriza no duplicar un envío incierto; el marcador no se borra para aparentar ausencia de envío.

Un precheck aceptado no equivale a consenso: la publicación queda `UNCERTAIN` hasta reconciliar. Timeouts conservan ID y bytes. Un vencimiento local tampoco demuestra que un envío anterior no haya ocurrido. S09 nunca prepara otro identificador automáticamente para reemplazar uno incierto; S10 definirá las nuevas preparaciones permitidas tras resultados definitivos y conservará su historia.

Los límites iniciales son 1 HBAR de prueba para mensajes, 2 HBAR de prueba para crear topic y 1 HBAR de prueba como máximo por consulta pagada del SDK. Cada RPC tiene timeout/deadline de 5 segundos y un intento; las operaciones compuestas tienen trabajo acotado, sin bucles de polling. No se compran fondos ni se incrementan límites automáticamente.

## Receipt, mirror y contraste

La reconciliación consulta el receipt del ID conocido incluyendo duplicados. Un receipt `SUCCESS` confirma; `UNKNOWN`, falta de receipt o fallo de transporte no prueban fracaso. Se consulta también mirror por transactionId, filtrando transacción original con nonce cero y sin programación, verificando tipo y topic. Esto permite recuperar resultados fuera del período breve de receipts. Fuentes: [receipt](https://docs.hedera.com/native/transactions/receipt) y [transacción por ID](https://docs.hedera.com/api-reference/transactions/get-transaction-by-id).

Mirror está fijado a `https://testnet.mirrornode.hedera.com`, con `redirect: error`, `cache: no-store` y timeout de 3 segundos por solicitud. Las respuestas tienen límites de 256 KiB para transacciones y 64 KiB para mensajes, con schemas de atributos utilizados y sin paginación indefinida. Las secuencias numéricas se recuperan desde el lexema original con el reviver de Node 24, evitando pérdida por Number, y se acotan al rango SQL.

La verificación requiere confirmación previa y lee la transacción y su mensaje por timestamp de consenso. Contrasta topic, payer, ID inicial cuando hay chunk_info, unidad única, secuencia esperada cuando existe, timestamp y envoltura completa: versión, demo, red, eventId, traceId, ordinal, tipo, rol y digest. El digest local ya fue recalculado desde SQL; una huella puramente local no acredita coincidencia remota.

| Resultado | Significado |
| --- | --- |
| `NOT_CHECKED` | Aún no se solicitó contraste. |
| `PENDING` | Receipt confirmado y mensaje aún ausente durante la ventana inicial; también se conserva espera cuando no existe confirmación histórica. |
| `MATCHED` | Mensaje remoto e identificadores coinciden con el registro esperado. |
| `MISMATCH` | Se observó evidencia diferente o contenido inválido en el mensaje localizado. |
| `UNAVAILABLE` | Falló la lectura o la evidencia histórica ya no está disponible; no demuestra un reset específico ni una entrega física. |

Confirmación y verificación son ejes separados. Se preserva `CONFIRMED` y su fecha aunque una consulta posterior falle o testnet se reinicie. Si mirror devuelve 404 después de tres minutos desde la confirmación conocida, el contraste pasa a no disponible. No se reescribe el payload para hacerlo coincidir. Se conserva la última evidencia observada si una comprobación posterior resulta pendiente/no disponible.

Los resultados SQL se aplican al transactionId esperado; el contraste además verifica la revisión temporal que leyó. Ningún resultado de una preparación anterior puede sobreescribir otra posterior. Las inconsistencias de identidad, secuencia o timestamp no se convierten en confirmación inventada.

## Proyección privada de S08

`PublicationSummary` conserva `state` y `verificationState`, y añade `network`, `topicId`, `transactionId`, `sequenceNumber`, `consensusTimestamp`, `confirmedAt`, `verifiedAt` y `lastErrorCode`. Los ausentes son `null`; secuencia es string y fechas ISO UTC.

Un mapper explícito compartido por recuperación y comandos selecciona esos campos. `lastErrorCode` solo acepta el catálogo categorizado propio `HCS_*`, nunca texto crudo. Quedan fuera bytes firmados, claves, metadata interna de generación, leases e historia técnica. S11 construirá la proyección pública separadamente.

## CLI administrativo del topic

Preparar un operador testnet financiado con HBAR ficticio y guardar ID/clave DER exclusivamente en el entorno privado. No pegar claves en comandos, documentación, issues o mensajes. `.env.example` es una plantilla sin valores. No se generan credenciales de red automáticamente.

```text
npm run hedera:topic -- --help
npm run hedera:topic -- prepare
npm run hedera:topic -- submit --file .cache/hedera/topic-UUID.json
npm run hedera:topic -- status --file .cache/hedera/topic-UUID.json
```

`prepare` consulta el operador, firma la creación con adminKey/submitKey del operador, sin feeScheduleKey ni tarifas personalizadas, y guarda un journal nuevo bajo `.cache/hedera/` con creación exclusiva y modo 0600. Contiene metadata y bytes firmados reutilizables, sin clave privada; debe tratarse como archivo privado. No envía la transacción.

`submit` valida y recupera ese archivo, consulta el resultado conocido y crea un marcador exclusivo `.submitted.json` sincronizado a disco antes del único envío. Una repetición solo consulta estado. Ejecutar pronto: una preparación vencida no recibe otro ID automáticamente. `status` funciona sin clave de firma y no envía. La lectura de journals se limita al directorio privado, archivos regulares, tamaño acotado y sin enlaces simbólicos.

Guardar manualmente el topic confirmado en `HEDERA_TOPIC_ID` y elegir una etiqueta nueva en `HCS_CONFIGURATION_GENERATION`. El CLI no modifica `.env.local`. Ante timeout usar `status`, no borrar el marcador ni repetir la creación a ciegas.

Después de un reset: conservar evidencia histórica, comprobar la disponibilidad real, preparar explícitamente otro topic, confirmar su ID, renovar etiqueta y comenzar un recorrido nuevo para usar ese destino. Los anteriores permanecen vinculados al suyo.

## Verificación y pendientes

Pasaron TypeScript, validación Prisma, generación de cliente, ayuda del CLI y build Next.js con los siete paths existentes. La ayuda no carga entorno privado, SDK ni conecta a SQL/Hedera. No se crearon ni ejecutaron suites de comportamiento.

Se aplicó `202610230002_hcs_binding` exclusivamente a PostgreSQL local mediante `db:migrate -- --local-only`. `db:status -- --local-only` confirmó las tres migraciones al día. PostgreSQL se inició para esa tarea y volvió a detenerse conservando datos. No se aplicó a Neon ni a otra base externa; una copia o despliegue debe aplicar sus migraciones antes de utilizar el esquema nuevo.

No se ejecutaron prepare/submit/status contra Hedera, no se creó topic o mensaje, no se desplegó ni creó commit. No se acredita todavía una integración real observada. S10 conectará coordinación y activación; S17 probará API con SQL real y proveedor controlado; S18 conservará la comprobación real de testnet separada y dentro de cuota.

Casos pendientes: persistencia antes de enviar, carreras y rollback, marcador seguido de caída, timeout y duplicados, receipt vencido, mirror demorado, envelope/digest distinto, contenido inválido, precisión de secuencias, saldo agotado, config incompleta, cambio de generación, reset, publicación histórica sin clave, privacidad y máximo de una unidad por hito.
