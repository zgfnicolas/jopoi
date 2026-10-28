# S16 · Preparación del despliegue gratuito

Preparación implementada en `feature/s16-despliegue-gratuito`, desde `main` con S15 integrado mediante PR #14 (`d198ace`). El usuario confirmó preparación local: no crear servicios, aplicar migraciones remotas ni publicar en esta entrega. El segundo fetch comprobó que la referencia remota coincide con esa base.

La entrega todavía no está aceptada: S17/S18, revisión visual, recursos externos y comprobación real de red siguen pendientes. No hay una URL publicada acreditada por S16.

## Comandos de preparación

Con Node 24 y npm en PATH, desde la raíz:

```powershell
npm run delivery:check -- --help
npm run delivery:check -- --profile local
npm run delivery:check -- --profile candidate --env-file .env.candidate.local
npm run delivery:build -- --env-file .env.candidate.local
npm run ops:status -- --help
```

En este workspace se usa Node portable como en S01:

```powershell
$taskNodeDirectory = (Resolve-Path .tools/node/node-v24.22.1-win-x64).Path
$env:Path = "$taskNodeDirectory;$env:Path"
```

| Comando | Efecto y resultado |
| --- | --- |
| `delivery:check` | Solo archivos y CPU. Comprueba Node/engine, coincidencia de dependencias con lockfile, secuencia del build, inventario de cuatro migraciones, activos/fuente/licencia, cron diario, política y formatos de configuración. Si hay clave de operador, comprueba DER con el parser existente, sin cliente ni red. |
| `--profile local` | Perfil predeterminado. Permite capacidades ausentes con avisos para conservar la base parcial S01. La configuración inválida o los archivos inconsistentes bloquean. |
| `--profile candidate` | Exige un archivo explícito (`--env-file` o `--vercel-env-file`) y valida como producción: capacidades completas, origen HTTPS, secretos independientes y conexiones Neon pooled/directa con TLS al mismo endpoint/base. No comprueba credenciales contra los proveedores. |
| `delivery:build` | Exige archivo y candidato válido. Ejecuta `prisma generate` y `next build` mediante procesos Node sin shell; se detiene ante fallo. No migra, conecta SQL, crea topic ni despliega. |
| `ops:status` | Exige archivo explícito y solo `DATABASE_URL` válida. Abre una transacción RepeatableRead con `SET TRANSACTION READ ONLY`, obtiene agregados y cierra la conexión. No ejecuta mantenimiento ni Hedera. |

Check y build usan salida JSON segura y código 0 para preparación válida sin comprobar servicios, 1 para bloqueo/fallo y 2 para argumentos inválidos. `CONFIGURATION_VALID_UNVERIFIED` no significa disponible ni aceptado. Las cuentas/planes, conectividad, migraciones aplicadas y S17/S18 quedan expresamente sin acreditar. Los nombres de variables y motivos son públicos; nunca se serializan valores, URLs o excepciones privadas.

El perfil candidato admite parámetros de conexión Neon `sslmode=require|verify-ca|verify-full` y, opcionalmente, `channel_binding=require`, una sola vez cada uno. Rechaza otros parámetros para impedir que opciones de la URL sustituyan el destino validado. No transforma las URLs ni las imprime; una configuración diferente requiere revisión explícita. La validación no reemplaza una conexión TLS real.

`npm run build` conserva su comportamiento lazy sin exigir credenciales completas; no se añadió ninguna migración o guardia de recursos externos al build normal.

## Selección de entorno sin mezcla

Copiar la plantilla vacía cuando corresponda preparar valores privados:

```powershell
Copy-Item .env.candidate.example .env.candidate.local
```

La copia privada queda ignorada por Git; S16 no la creó ni completó. Los secretos se generan independientemente con 32 bytes aleatorios mediante una herramienta local y se introducen directamente en el archivo/panel privado, nunca en documentación, argumentos o chat.

Todos los CLI administrativos admiten `--env-file ARCHIVO`: base de datos, topic, mantenimiento y exportación. El archivo se resuelve desde la raíz del repositorio, tiene un límite de 64 KiB y acepta solo las variables conocidas de S01; un campo desconocido, incluido `NEXT_PUBLIC_*`, se rechaza sin mostrarlo. Un archivo ausente no activa fallback.

S19 añade `--vercel-env-file ARCHIVO` para exportaciones Vercel: selecciona solo las variables reconocidas de Jopói e ignora las adicionales sin importarlas al proceso. Es excluyente con el selector estricto y conserva el sellado de ausencias. La conexión administrativa puede llegar como `DATABASE_URL_UNPOOLED`; si también existe `DIRECT_URL`, deben coincidir. La guía principal para un proyecto nuevo es el [procedimiento S19](persistencia-gestionada-desde-vercel.md); los ejemplos con `.env.candidate.local` siguen siendo compatibles para archivos estrictos anteriores.

Con selección explícita se reemplazan todas las variables conocidas del proceso, también las omitidas, por cadenas vacías cuando faltan. Eso impide que cargas posteriores de dotenv/Prisma/Next completen la configuración de aplicación desde `.env.local`. El entorno del sistema necesario para ejecutar herramientas, como PATH, se conserva. Sin selector se mantiene la precedencia anterior: proceso, `.env.local`, `.env`.

Los lanzadores usan **`node --import tsx --`** antes del script. La separación final evita que Node interprete `--env-file` como su propia opción antes de que llegue al CLI. `--help` se resuelve antes de leer el archivo; se comprobó pasando una ruta inexistente a todas las ayudas.

| Uso | Datos y configuración |
| --- | --- |
| Desarrollo | PostgreSQL portable y `.env.local`; no se reemplaza ni resetea durante S16. |
| S17 y recorridos deterministas de S18 | PostgreSQL local dedicado a pruebas, separado del desarrollo y de Neon. Su provisión/fixtures corresponden a las specs de pruebas. |
| Candidato/demo externa | Neon Free y secretos propios. No usar sus credenciales para las suites deterministas ni sus contactos reales como fixtures. |
| Aceptación real publicada | Etapa separada S18, con sesión sintética controlada, cuota acotada y evidencia de testnet. No declarar aceptación a partir del check offline. |

## Secuencia local reproducible

Los siguientes pasos son instrucciones para un entorno de desarrollo; **arranque y migración modifican el entorno local y no se ejecutaron en S16**:

```powershell
npm ci
npm run db:generate
npm run db:local:setup
npm run db:local
npm run db:migrate -- --local-only
npm run db:status -- --local-only
npm run db:check -- --local-only
npm run delivery:check -- --profile local
npm run typecheck
npm run db:validate
npm run build
npm run dev
```

`db:local:setup` corresponde al setup inicial descrito en [persistencia SQL](persistencia-sql.md); una instalación existente conserva su base. Verificar las capacidades privadas necesarias antes de operar. Los activos `chips-v1`, la fuente Barlow y sus licencias están versionados; la visita y el build no descargan esos recursos. No ejecutar las suites antes de S17/S18.

## Preparación externa futura — no ejecutada

1. **Proyecto y presupuesto desde Vercel.** Crear un proyecto personal Hobby nuevo y vincular el directorio sin desplegar todavía. Aplicar el [procedimiento S19](persistencia-gestionada-desde-vercel.md), sin tarjeta, Pro, dominios pagos ni upgrades. La finalidad sigue siendo prototipo personal, sin constituir aprobación formal de elegibilidad. Hedera testnet conserva su configuración independiente.
2. **Base nativa del Marketplace.** Aprovisionar Neon Free desde Vercel, sin alta independiente en Neon, y conectar únicamente Production. La integración sincroniza `DATABASE_URL` pooled y `DATABASE_URL_UNPOOLED` directa. Los CLI aceptan la exportación mediante `--vercel-env-file`, sin copiar conexiones manualmente ni modificar `.env.local`. `DIRECT_URL` sigue siendo compatible; si ambas directas tienen valor deben coincidir. Verificar mismo endpoint/base, TLS, región y plan realmente gratuito. El pool sigue limitado a dos conexiones por instancia, no globalmente.
3. **Migraciones explícitas.** Revisar el destino privado elegido antes de ejecutar los comandos siguientes. Aplicar únicamente las cuatro migraciones versionadas; nunca `reset`, `db push` o una migración automática en build para reparar datos vigentes.

```powershell
npm run db:status -- --env-file .env.candidate.local
npm run db:migrate -- --env-file .env.candidate.local
npm run db:status -- --env-file .env.candidate.local
npm run db:check -- --env-file .env.candidate.local
```

`db:status` y `db:check` consultan; `db:migrate` modifica SQL. Un despliegue nuevo no implica que esas migraciones estén aplicadas. Los mensajes nativos de Prisma pueden mostrar metadatos del destino, por lo que se ejecutan en una terminal administrativa privada, no como salida pública.

4. **Hedera.** Obtener operador testnet, clave DER y saldo ficticio; no comprar HBAR. Completar esos campos y preparar/consultar el topic con el [procedimiento S09](hedera-testnet.md), usando el mismo selector:

```powershell
npm run hedera:topic -- prepare --env-file .env.candidate.local
# Sustituir topic-UUID.json por el archivo devuelto por prepare.
npm run hedera:topic -- submit --file .cache/hedera/topic-UUID.json --env-file .env.candidate.local
npm run hedera:topic -- status --file .cache/hedera/topic-UUID.json --env-file .env.candidate.local
```

Prepare firma y escribe el journal privado; submit envía una vez con el ID persistido. Ante incertidumbre consultar ese archivo; no borrar el marcador ni regenerar una identidad para reenviar a ciegas. Completar `HEDERA_TOPIC_ID` solo con confirmación real y elegir una generación explícita nueva. El journal no se sube a Vercel ni a Git.

5. **Proyecto Vercel y origen.** Crear o enlazar el proyecto Hobby cuando se autorice la publicación. La CLI oficial permite crear un proyecto y vincular el directorio sin ejecutar el comando de despliegue; requiere una sesión del usuario. Confirmar el dominio de producción asignado en el proyecto, no deducirlo del nombre ni copiar una URL temporal de preview. Si todavía no se conoce, el candidato queda pendiente de ese dato. [Gestión de proyectos](https://vercel.com/docs/cli/project), [vinculación](https://vercel.com/docs/cli/link).
6. **Configuración y build.** Seleccionar Next.js, Node 24, raíz del repositorio, instalación `npm ci` y build `npm run build`; mantener autodetección de salida. Establecer `APP_URL` HTTPS antes de construir, pues `/demo` incorpora ese origen estático para compartir/QR. No activar el despliegue automático de ramas con credenciales de la demo compartidas con pruebas. [Node compatible en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

| Variables | Ubicación futura |
| --- | --- |
| `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `APP_URL`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_TOPIC_ID`, `HCS_CONFIGURATION_GENERATION`, `HCS_DAILY_LIMIT` | Archivo administrativo privado y entorno Production del proyecto Vercel. Nunca `NEXT_PUBLIC_*`. |
| `DATABASE_URL_UNPOOLED` o `DIRECT_URL` | Conexión administrativa para Prisma CLI. La integración sincroniza la primera; no duplicarla manualmente. La aplicación no la necesita para operar. |
| `NODE_ENV` | La plantilla candidata usa production; Vercel/Next lo establecen en sus procesos. No se crea otro entorno de producción desde la UI. |

Antes de construir el candidato local, ejecutar `delivery:check --profile candidate` con su archivo y después `delivery:build` con el mismo. El archivo candidato no se envía ni versiona: Vercel recibe sus variables mediante la configuración privada del proyecto. En Vercel se mantiene el build normal sin migraciones. Cambiar `APP_URL` requiere un nuevo build; no basta con cambiar el valor runtime.

7. **Publicación y aceptación posteriores.** Una URL candidata no es una entrega aceptada. Registrar revisión/commit, planes, dominio, estado de migraciones y bloqueos; completar S17 y S18, incluida evidencia separada de cinco hitos reales, QR, contacto, móvil/teclado y mantenimiento. No trasladar fixtures o limpieza determinista a los contactos reales de Neon.

## Mantenimiento, observación y recuperación

Se conserva una sola entrada `0 3 * * *` en `vercel.json`: una vez por día a las 03:00 UTC (medianoche de Argentina). Hobby puede ejecutarla dentro de esa hora; no garantiza el minuto exacto ni reintenta automáticamente una falla. Se conserva `maxDuration=60`, presupuestos acotados, leases y retención de S10, sin programador externo. `CRON_SECRET` sigue siendo independiente y de al menos 32 caracteres. [Frecuencia y precisión](https://vercel.com/docs/cron-jobs/usage-and-pricing), [seguridad y recuperación de cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

El endpoint autenticado registra `MAINTENANCE_SKIPPED`, `MAINTENANCE_COMPLETE` o `MAINTENANCE_PARTIAL`, con conteos de borrados/trabajo y un código seguro. Un fallo de servidor registra `MAINTENANCE_FAILED` y estado HTTP; no registra cabeceras, contactos, bytes, IDs privados ni errores crudos. La respuesta HTTP y las reglas de S10 se conservan.

La observación administrativa explícita se realiza así, **solo cuando se autorice consultar ese destino**:

```powershell
npm run ops:status -- --env-file .env.candidate.local
```

Entrega conteos por publicación/verificación, intentos por clase/estado, errores categorizados, recorridos/contactos vencidos pendientes de limpieza y fecha del último mantenimiento completo. Cuenta filas retenidas, también las vencidas; no garantiza que la red esté disponible. No ofrece un endpoint público ni devuelve filas o datos personales. Los códigos HCS desconocidos se agrupan sin imprimir su contenido.

| Situación | Recuperación explícita |
| --- | --- |
| Neon suspendido o cuota agotada | Consultar plan/uso en la cuenta y esperar o reanudar dentro de Free. Mantener SQL y mensajes de indisponibilidad; no cambiar de plan o proveedor. |
| Cupo HCS agotado | Mantener pendiente durable y esperar el siguiente día UTC. No ampliar 100, crear otro operador para evadir cupo ni mostrar confirmación ficticia. |
| Cron perdido/incompleto | Revisar logs y último mantenimiento; no interpretar ausencia de log como éxito. Una ejecución administrativa posterior usa `maintenance --run --env-file ...`; modifica SQL y puede enviar HCS, por lo que no forma parte de esta verificación. |
| `SESSION_SECRET` rotado | Las cookies anteriores dejan de ser válidas; no transferir propiedad a sesiones nuevas ni borrar los recorridos. |
| `CRON_SECRET` rotado | Actualizar el entorno del proyecto y redesplegar según el proveedor; verificar autorización posteriormente, sin registrar el secreto. |
| Operador/topic/generación cambiados o reset testnet | Conservar SQL y la evidencia anterior. Recuperar cuenta/saldo de prueba, crear un topic cuando proceda y configurar generación nueva para recorridos nuevos. Los eventos anteriores no se reenvían con otra identidad. [Resets de testnet](https://docs.hedera.com/networks/testnet). |
| Rollback de aplicación | Elegir una versión compatible con el esquema vigente. No revertir SQL mediante reset ni borrar datos para compatibilizar. Revisar origen estático y cron restaurado: un rollback no garantiza reactivar un cron deshabilitado. |

El vencimiento de acceso continúa a siete días para recorridos y 90 para contactos; el borrado ocurre en una ejecución diaria exitosa posterior, no necesariamente en el segundo exacto. Un barrido parcial conserva su estado y requiere otra ejecución elegible/administrativa.

## Evidencia y pendientes

| Capacidad | Estado al cerrar S16 |
| --- | --- |
| Node, tipos, Prisma, build normal e inventario local | Comprobados. |
| Ayudas administrativas | Comprobadas con un archivo inexistente: no lo cargan ni conectan. |
| Perfil local | `CONFIGURATION_VALID_UNVERIFIED`, con avisos por cron/HCS ausentes. |
| Candidato vacío y build estricto | Bloqueados correctamente, sin heredar las capacidades locales ni iniciar build. |
| Origen inválido, DER sintética inválida, argumentos y archivo obligatorio | Comprobación offline por CLI; sin escribir archivos ni contactar red. |
| Pool/TLS, destino, inventario y logger | Revisión estática; no conexión remota ni ejecución real de mantenimiento. |
| `ops:status`, migraciones remotas y build de candidato completo | Implementados; ejecución real pendiente de configuración/etapa autorizada. |
| Cuentas, planes en cuenta, Neon, topic/saldo y secretos externos | No provisionados ni acreditados por esta entrega. |
| Publicación, cron desplegado, S17/S18 y revisión visual | Pendientes; no se declara aceptación global. |

La configuración local existente tiene SQL/sesión con formato válido, sin conectividad comprobada en S16. Faltan `CRON_SECRET`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_TOPIC_ID` y `HCS_CONFIGURATION_GENERATION`. La plantilla candidata está vacía a propósito; requiere todos sus datos externos para superar el perfil estricto.

El sandbox bloqueó la introspección de usuario del runtime tsx con `uv_os_get_passwd/ENOMEM`. Las ayudas y comprobaciones offline se completaron fuera de ese sandbox con aprobación, sin conceder efectos de negocio. No se crearon ni ejecutaron suites, fixtures, consultas operativas, migraciones, mantenimiento, exportaciones, firmas, envíos HCS o recursos externos. No hubo commit, push ni despliegue. Los casos de SQL, cron, concurrencia, disponibilidad y aceptación real siguen en S17/S18.
