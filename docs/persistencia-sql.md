# Persistencia SQL y migraciones

S03 incorpora PostgreSQL local, siete modelos Prisma, migración inicial, restricciones SQL y acceso privado reutilizable. Se implementó en `feature/s03-persistencia-sql`, desde `main` con S01/S02 integradas. No añade API, cookies, formularios, reglas de operación, publicaciones Hedera ni cron.

Actualización S04: una segunda migración añade el octavo modelo, `SessionRunIntent`, con clave por sesión/intención y FK compuesta de propiedad. Los endpoints de sesión e inicio/reinicio ya utilizan esta base; ver [sesiones y aislamiento](sesiones-y-aislamiento.md). La migración inicial permanece intacta. Las descripciones siguientes conservan el alcance de S03.

Actualización S05: la API de solicitud y el exportador privado utilizan `DemoRequest`, sin nuevas migraciones. Se fija vencimiento de 90 días y la exportación excluye vencidos al corte inicial; el borrado sigue pendiente de S10. Ver [contactos y exportación](contactos-y-exportacion.md).

Actualización S06: el límite exacto de gramos de `toStoredGrams` se centraliza en `parseOperationQuantityGrams` del dominio, conservando su contrato. Las decisiones operativas son puras; no se escriben cambios de estado hasta integrarlas con eventos y comandos en S07/S08. Ver [reglas de operación](reglas-de-operacion.md).

Actualización S07: un módulo privado agrupa recibo idempotente, versión/estado, evento y publicación pendiente en la transacción serializable existente. Reutiliza modelos, índices y triggers sin migraciones adicionales; la API corresponde a S08. Ver [eventos y hashes](eventos-y-hashes.md).

Actualización S08: la [API privada del recorrido](api-del-recorrido.md) conecta esa ejecución y añade lecturas autorizadas de snapshot e historial. Reutiliza la misma base, sin migraciones ni cambios en los servicios de escritura de S07.

## Preparación local

Se utiliza PostgreSQL **17.11**, empaquetado EDB **17.11-5**, para Windows x64. La distribución portable procede de la [página de binarios EDB](https://www.enterprisedb.com/download-postgresql-binaries). El [checksum publicado por EDB](https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip.sha256) es:

```text
80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f
```

El setup verifica ese hash antes de extraer y registra versión, URL y checksum en `.tools/postgresql/17.11-5/source.json`. La descarga y extracción utilizan el ZIP de EDB y `tar.exe` de Windows. No se instala un servicio, no se modifica el PATH de Windows ni se crean cuentas externas. El manifiesto y lockfile dejan de incluir PGlite como dependencia directa.

Binarios en `.tools/postgresql/17.11-5/`; datos en `.cache/postgresql-17/data/`, con logs y conexión privada en el directorio padre. Estas carpetas están ignoradas por Git. El servidor escucha solo en `127.0.0.1:54321`, con SCRAM, contraseña generada criptográficamente, 20 conexiones máximas y 32 MB de buffers compartidos. El rol local `jopoi` es el usuario de bootstrap de este entorno de desarrollo; no representa la política de privilegios de un futuro despliegue.

El setup prepara la base `jopoi` y escribe únicamente `DATABASE_URL` y `DIRECT_URL` en `.env.local`, sin mostrar sus valores. En local ambas apuntan a la misma base. Si encuentra valores diferentes ya configurados, se detiene y los conserva. No restablece clusters ni borra bases. La contraseña también queda en el archivo privado `.cache/postgresql-17/connection.json`, necesario para repetir el setup sobre ese cluster; no eliminarlo mientras se conserve el cluster.

Con Node 24 y npm en PATH, ejecutar desde la raíz del repositorio:

```powershell
npm run db:generate
npm run db:local:setup
npm run db:migrate -- --local-only
npm run db:status -- --local-only
npm run db:check -- --local-only
npm run typecheck
npm run db:local:stop
```

Después de la preparación inicial, `npm run db:local` arranca el cluster existente; `npm run db:local:status` informa su estado y `npm run db:local:stop` lo detiene conservando datos. El setup ya lo deja iniciado para permitir migrar. Los procesos se lanzan sin ventanas y el arranque desacopla los pipes del servidor para que el CLI pueda terminar en Windows.

En este workspace se puede anteponer temporalmente `.tools/node/node-v24.22.1-win-x64` al PATH de la sesión, como en S01. Una copia nueva necesita restaurar dependencias mediante `npm ci` y generar el cliente; los binarios Node/PostgreSQL y el cliente generado no están versionados.

## Prisma y conexiones

Se conservan Prisma CLI, Client y `@prisma/adapter-pg` **7.10.1**, `pg` **8.23.1** y las demás versiones existentes. No se acepta la actualización a Prisma 8 ofrecida por el CLI como parte de S03.

`prisma.config.ts` configura el schema, directorio de migraciones y `DIRECT_URL`, según el [contrato de configuración de Prisma 7](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference). El cliente se genera con `prisma-client`, ESM, en `src/generated/prisma`, ignorado por Git. No hay URL de conexión dentro del schema.

El loader privado de CLI respeta primero las variables del proceso, después `.env.local` y finalmente `.env`, sin sobrescribir valores previos ni imprimirlos. No importa el marcador de React `server-only`. En Next.js sigue aplicando la carga de entorno propia del framework.

- `db:validate` y `db:generate` no necesitan una conexión SQL configurada.
- `db:migrate` y `db:status` exigen `DIRECT_URL` válida antes de invocar Prisma; no usan una base por defecto si falta configuración.
- `db:check` exige `DATABASE_URL` y ejecuta un `SELECT 1` mediante el cliente generado; solo informa disponibilidad si la consulta terminó correctamente.
- `--local-only` en esos tres comandos limita el destino a `127.0.0.1:54321/jopoi`. Se utilizó ese límite para la migración inicial. No es un mecanismo de autorización HTTP.

El engine instalado necesita datasource configurada para `migrate diff`, incluso al comparar un schema con vacío. La generación inicial del SQL se realizó después de preparar la conexión local; no se introdujo una URL ficticia como fallback. La ruta documentada de aplicación es `db:migrate`, no una ejecución de Prisma sin validar su configuración.

En la publicación posterior, la aplicación utilizará `DATABASE_URL` pooled y el CLI `DIRECT_URL` directa. S03 no provisiona Neon ni aplica migraciones remotas. [Referencia de conexiones y pool de Prisma](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections).

## Modelo físico

| Modelo | Responsabilidad |
| --- | --- |
| `DemoSession` | Identidad privada, hash único del token, creación, expiración y contador 0–3. Nunca guarda el token sin hash. |
| `DemoRun` | Propietario, localizador público aleatorio, intención de creación, ordinal, versión, estado, expiración, snapshot y versión del escenario. Contiene declaración, asignación y recepción separadas. |
| `CommandReceipt` | Clave idempotente por recorrido, hash de intención, acción, versión resultante y resultado lógico JSONB. Puede existir sin evento para guardar borradores. |
| `OperationEvent` | Comando originador, ordinal, tipo, rol simulado, instante, versión/payload JSONB y digest SHA-256. Es inmutable después de insertarse. |
| `HcsPublication` | Un registro como máximo por evento; estado de envío separado de verificación, configuración testnet, transacción/bytes preparados, historial, intentos, próximo intento y lease. |
| `DailyQuota` | Clave compuesta `HCS_GLOBAL`/fecha UTC y contador durable entre 0 y 100. No se relaciona con un topic o sesión particular. |
| `DemoRequest` | Datos reales de contacto, identificadores y huella para idempotencia, creación y expiración. Sin relación con recorridos o eventos. |

Prisma mantiene además su propia tabla de historial de migraciones. Los estados operativos y tipos de evento corresponden a S06/S07. Publicación admite `QUEUED`, `IN_FLIGHT`, `UNCERTAIN`, `CONFIRMED`, `FAILED`, `PAUSED_QUOTA` y `PAUSED_CONFIG`; verificación admite `NOT_CHECKED`, `PENDING`, `MATCHED`, `MISMATCH` y `UNAVAILABLE`.

Un recorrido es su único lote y operación; no hay división ni consolidación. La asignación mantiene comprador/viaje/fecha nulos hasta asignar y exige los tres juntos cuando se guardan. Sus identificadores de ejemplo deben pertenecer al snapshot: esa validación corresponde a S06, no a tablas de empresas reales. Peso declarado y recibido son columnas diferentes; motivos de rechazo e incidencia también están separados.

El snapshot de S02 se conserva completo en JSONB. Los borradores modifican la declaración del recorrido, no `initialLot` del snapshot. No hay seed global de sesiones, lotes ni contactos. S04 creará cada recorrido desde su propio snapshot; S07 generará payloads mediante una lista pública explícita, sin copiar automáticamente modelos completos.

Los bytes de transacción, historial técnico, hashes de tokens, receipts internos y datos de contacto no son DTO públicos. No devolver modelos Prisma directamente desde futuras API. S08/S11 construirán sus proyecciones permitidas.

## Precisión y restricciones

Pesos como `BIGINT` en gramos: `12000.000` kg equivale a `12000000` gramos. El límite positivo de PostgreSQL es `9223372036854775807` gramos; `toStoredGrams` reutiliza S02 y rechaza un valor mayor con `RULE_VIOLATION`, antes de escribir. No hay conversión del peso a `Number`, truncamiento ni tolerancia por redondeo.

Humedad como `SMALLINT` en centésimas: `28.00`% equivale a 2800, con rango 0–10000. `toStoredHumidity` normaliza mediante S02 y convierte únicamente ese entero acotado, exactamente representable. Los helpers inversos devuelven tres decimales para kg y dos para humedad. Estos valores internos no se serializan como `bigint` en JSON.

Fechas de aplicación y expiración usan `timestamptz(3)`. El timestamp de consenso se conserva como cadena de segundos/nanosegundos, con nueve posiciones decimales; no se reduce a la precisión de `Date`. Los importes permanecen como cadenas decimales del snapshot, calculadas por S02.

La migración incorpora restricciones que deben conservarse en futuras migraciones, aunque Prisma no las represente por completo:

- UUID públicos y hash de sesión únicos; intención de creación y ordinal 1–3 únicos por sesión; intención de comando única por recorrido.
- Un evento por comando y un ordinal por recorrido. La relación compuesta comando/recorrido impide asociar un evento a un comando de otro recorrido.
- Versiones/ordinales positivos, hashes en hexadecimal minúsculo, cantidades positivas, humedad acotada y expiración posterior a creación.
- Snapshot JSONB de objeto, versión coherente y marca ilustrativa; resultados/payloads de objeto e historial de intentos de array.
- Solo `testnet`, hasta tres intentos automáticos y uno manual, lease completo o ausente y preparación de transacción con topic/generación/bytes coherentes.
- Unicidad de publicación por evento y de transactionId preparado; índice de pendientes por estado/fecha, leases, propiedad y vencimientos.

Los triggers rechazan cualquier `UPDATE` de un evento, cambios de identidad/snapshot/retención del recorrido y cambios de cantidad/humedad después de salir de `DRAFT`. También bloquean volver a `DRAFT`. Permiten el `DELETE` usado por la limpieza. La máquina completa de estados, compatibilidad y motivos queda en S06.

## Acceso y transacciones

`src/server/database/index.ts` es la entrada protegida por `server-only`:

- `getDatabase()` obtiene un cliente lazy por proceso. En desarrollo lo conserva durante hot reload; importar el módulo no abre conexiones ni exige todos los secretos.
- `withDatabase(work)` envuelve lecturas u operaciones independientes y clasifica errores SQL.
- `withTransaction(work)` ejecuta únicamente SQL, con aislamiento serializable, espera máxima de 2 s y duración de 5 s. No repite callbacks automáticamente.
- `advanceRunVersion(tx, runId, expectedVersion)` incrementa mediante actualización condicional. Si no hay coincidencia, lanza `VERSION_CONFLICT`. El servicio debe comprobar propietario y vigencia dentro de la misma transacción antes de llamarlo.

S04/S06–S08 agruparán cambios de estado, recibo, evento y pendiente en esa transacción. No llamar Hedera, red ni otros efectos externos desde el callback. Fallar el callback revierte el conjunto; S17 verificará ese comportamiento desde las API, sin pruebas de funciones privadas.

La fábrica separada `createDatabaseClient(url)` sirve también a CLI y no lee entorno global. El adaptador admite dos conexiones por instancia, conexión de 3 s, timeout SQL de 5 s y cierre idle de 10 s. Respeta TLS configurado en la URL, sin desactivar verificación. En servidor no se desconecta tras cada petición; el CLI cierra su cliente en `finally`. Cambiar la conexión de un proceso ya iniciado requiere reiniciarlo.

`mapDatabaseError` convierte fallos conocidos de conexión, autenticación, pool y timeout en `DATABASE_UNAVAILABLE`; conflictos de serialización/deadlock en `VERSION_CONFLICT`. Unicidad y otras restricciones quedan para interpretación del servicio, no se presentan indiscriminadamente como caída de base. Los errores desconocidos terminan en el contrato genérico de S01. No se registran consultas, conexiones, claves ni mensajes crudos de proveedor; los callbacks del pool solo emiten códigos categorizados.

`ApplicationError` pasó a un núcleo privado reutilizable por CLI; S01 lo sigue exportando desde su mismo adaptador HTTP. Su contrato público no cambia.

## Retención y migraciones

La FK sesión→recorrido usa `RESTRICT`, no cascada. Una sesión vencida a las 24 horas conserva sus recorridos durante su plazo operativo de siete días. La caducidad no se interpreta como borrado inmediato.

S10 eliminará recorridos vencidos en lotes acotados; sus comandos, eventos y publicaciones se eliminan en cascada. Después podrá eliminar sesiones vencidas sin recorridos. Los contactos vencen por separado a los 90 días. No se eliminarán cuotas vigentes ni mensajes HCS al borrar SQL. Las futuras API bloquearán acceso vencido sin esperar al barrido.

La migración `202610220001_initial` contiene el DDL generado más las restricciones y triggers, dentro de `BEGIN`/`COMMIT`. No modificarla después de aplicarla: añadir una nueva migración ante cambios. No usar `db push` ni `migrate reset` para sincronizar datos existentes. Ante fallos, revisar estado y logs privados; cualquier resolución del historial debe corresponder al estado real de la base, sin marcar una migración fallida como exitosa ni borrar datos para ocultar el problema.

Un puerto ocupado detiene el arranque sin finalizar procesos ajenos. El setup no regenera credenciales de un cluster existente si falta su archivo privado. Diagnósticos de comandos nativos se guardan en `.cache/postgresql-17/last-command.log`; el servidor mantiene `server.log`, ambos fuera de Git.

## Evidencia y pendientes

Comprobado durante S03: checksum del ZIP, preparación SCRAM/loopback, creación de la base, validación de schema, generación Prisma, aplicación de la migración inicial, estado actualizado y `SELECT 1` mediante el cliente generado. También se ejecuta comprobación TypeScript y revisión de formato. Al cerrar se detiene el servidor conservando el cluster y la base migrada.

No se crearon datos de negocio, cuentas externas, despliegues ni transacciones Hedera. No se crearon ni ejecutaron suites. Quedan para S17/S18 las verificaciones observables de atomicidad, concurrencia, idempotencia, autorización, inmutabilidad, snapshots históricos, precisión, fallos SQL y limpieza de vencidos sin afectar registros vigentes.

La base de S03 habilita las siguientes specs; no implementa sus servicios HTTP ni acredita que ya funcione el recorrido completo.
