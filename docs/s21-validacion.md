# S21 · API, sesiones, concurrencia y seguridad de datos

Estado: implementación y aceptación local aprobadas. API (43 pruebas), CLI (19 pruebas), tipos, Prisma, build, 18 comparaciones de rendimiento y cookie sobre HTTPS local aprobados. Se cubrieron 32 escenarios de navegador, con repetición focalizada del caso de cookie en los cuatro proyectos; también se repitieron auditoría CLI y restauración de evidencia. La matriz generada informa localPassed=true y globalAcceptance=false: los controles del proveedor conservan estado pendiente.

## Decisiones confirmadas

- Sesiones anónimas de 24 horas, tres recorridos, roles simulados y ausencia de logout, cuentas y access/refresh tokens. El token identifica una sesión, no una empresa. Rotar SESSION_SECRET invalida las credenciales anteriores; no recupera recorridos bajo una sesión nueva.
- Límites por visitante y globales compartidos en PostgreSQL, sin servicios pagos. Ventanas UTC fijas: SESSION 20/200 por diez minutos; CONTACT 5/100 por hora; VERIFICATION 30/300 por minuto; TRACE 120/1000 por minuto. Un cambio de ventana puede admitir ráfagas a ambos lados de su frontera; no se promete una ventana móvil ni protección de red contra DDoS.
- IP exclusivamente desde el ingreso Vercel; fuera de él, grupo local compartido. Persistencia de HMAC con separación de propósito, ámbito y fecha, sin direcciones en claro. Usuarios detrás de una misma red comparten límite; rotación del secreto cambia el identificador. Retención de contadores: vencimiento de ventana más 48 horas, eliminación física en barridos posteriores con capacidad disponible.
- GET públicos no mutan recorridos, contactos, eventos ni publicaciones; escriben únicamente admisión técnica. Rechazo con RATE_LIMITED/429, no-store y Retry-After; indisponibilidad del contador impide ejecutar la operación. Los reintentos cuentan para el límite técnico y conservan su idempotencia de negocio.
- El pool limita dos conexiones por cliente, no todo el despliegue. SQL de dominio permanece serializable; admisión usa una transacción corta ReadCommitted y reserva global antes de visitante. El rechazo revierte ambas reservas. No hay llamadas externas dentro de SQL.
- Las conexiones de aplicación fijan TimeZone=UTC y los instantes de SQL explícito se envían como ISO con zona. La regresión comprueba el instante físico de eventos frente al payload. Antes de actualizar un entorno existente con zona distinta de UTC, revisar posibles diferencias históricas entre ambos: no se corrigen timestamps ni hashes automáticamente. El proveedor debe comprobar también compatibilidad de parámetros de conexión con su pooler.

## Inventario de la API

Todas las mutaciones de navegador requieren origen configurado exacto, X-Jopoi-Request y JSON. Los métodos ajenos al handler son rechazados por Next.js. Los errores no incluyen consultas, excepciones, conexiones, contactos ni credenciales.

| Superficie | Métodos y acceso | Efectos y protección |
| --- | --- | --- |
| Sesión demo | GET privado; POST anónimo | GET recupera vigencia; POST recupera/crea sesión y cookie. SESSION protege POST; no-store/Vary Cookie |
| Inicio/reinicio de recorrido | POST privado | Intención UUID, propiedad, vigencia, cupo e idempotencia; no-store/Vary Cookie |
| Recorrido actual/por identificador | GET privado | Propiedad y vigencia dentro de SQL; no-store/Vary Cookie |
| Comandos | POST privado | Versión, rol simulado y transición; recibo/estado/evento/pendiente atómicos; no-store/Vary Cookie |
| Reintento de publicación | POST privado | Pertenencia del evento al recorrido, propiedad, cupos e intención; no-store/Vary Cookie |
| Contacto | POST anónimo | Validación y recibo idempotente, CONTACT, datos reales separados; no-store |
| Trazabilidad | GET público | TRACE, lectura del DTO público mínimo, no-store; sin escritura de negocio |
| Contraste remoto | GET público | VERIFICATION, evento perteneciente al recorrido, red fuera de SQL y nueva comprobación de vigencia; no-store |
| Cron | GET administrativo | Bearer independiente, lease y trabajo acotado; no-store/Vary Authorization |
| Exportación/auditoría SQL | CLI privado | Entorno seleccionado explícitamente; no hay endpoint HTTP administrativo |

## Modelo de datos y fuentes de verdad

- DemoSession conserva hash de credencial, vencimiento y contador de recorridos. DemoRun referencia al propietario y conserva declaración, versión y snapshot inmutable. Claves únicas por intención y ordinal, más FK compuesta de intención, impiden asociación cruzada y duplicados.
- CommandReceipt conserva la intención y su resultado original. OperationEvent es evidencia histórica inmutable, vinculada por FK compuesta al recibo del mismo recorrido. El snapshot, resultado y payload son copias históricas con objetivos distintos; no son catálogos mutables duplicados.
- HcsSubmissionAttempt representa admisiones/envíos y su prueba; HcsPublication representa la proyección actual y las preparaciones sustituidas en attemptHistory. El historial JSON no sustituye la tabla de intentos ni autoriza otro envío. Las identidades externas se conservan para conciliar incertidumbre.
- DailyQuota limita gasto HCS; MaintenanceLease coordina barridos. RequestRateBucket limita solicitudes y no modifica cupos de negocio. DemoRequest conserva contactos reales fuera de snapshots, eventos y HCS.
- Enums modelan vocabularios cerrados. Viajes y motivos pertenecen al escenario versionado. Sin un requisito de edición independiente no se añaden tablas catálogo.
- Restrict impide eliminar una sesión con recorridos. Borrar un recorrido vencido elimina sus intenciones, recibos, eventos e intentos mediante cascadas previstas. La limpieza comprueba leases válidos y nunca depende de borrar una sesión para hacerla vencer.
- Los CHECK SQL, triggers y funciones son parte del esquema efectivo; no alcanza con leer el modelo Prisma. Los triggers protegen identidad/snapshot/declaración, eventos y datos de envíos. No se incorporan procedimientos almacenados ni RLS sin una necesidad nueva.

## Procedimiento de permisos del proveedor

Aplicar solo tras revisión administrativa en el proveedor; esta implementación no cambia permisos remotos. Crear un login de ejecución sin superusuario, creación de roles/bases, replicación, bypass RLS ni membresía del propietario. El propietario/migrador debe ser distinto. Conceder CONNECT y USAGE, nunca CREATE en el esquema ni acceso al historial de migraciones.

| Entidades | Permisos de ejecución |
| --- | --- |
| Sesión, recorrido, cuota, contador técnico | SELECT, INSERT, UPDATE, DELETE |
| Intención, recibo, evento | SELECT, INSERT |
| Publicación, intento, lease de mantenimiento | SELECT, INSERT, UPDATE |
| Contacto | SELECT, INSERT, DELETE |

Revisar permisos heredados y grants a PUBLIC, revocar ejecución pública de funciones protectoras y verificar el resultado con `db:audit` y las pruebas negativas. Las cascadas de retención no requieren otorgar UPDATE de eventos. Para migraciones futuras conceder permisos explícitos de sus nuevas tablas; no instalar permisos por defecto abiertos. Exportar usa los SELECT autorizados sin crear una API pública.

Conexiones remotas: cifrado con certificado y nombre del servidor verificados; parámetros de URL no pueden sustituir una configuración SSL estricta. Loopback permite PostgreSQL sin TLS para desarrollo y pruebas. Un resultado TLS local no acredita la conexión del proveedor.

## Matriz de aceptación

La matriz siguiente se completa con resultados ejecutados; una historia puede requerir más de una frontera. Los reportes de API conservan los casos originales y los casos S21; escenarios no ejecutados son BLOQUEADO, nunca APROBADO por omisión.

La matriz estructurada se genera con `npm run s21:report`: conserva prioridad P0 para acceso/integridad/recuperación y P1 para rendimiento/evidencia, riesgo, corrección, historias y casos asociados. Los estados son comprobado, parcial, ausente requerido, no aplicable justificado y pendiente evidencia externa. Se guarda en `.cache/s21/control-matrix.json` y Markdown; no permite confundir aceptación local con aceptación global.

| Control / historias S21 | Evidencia ejecutada | Estado |
| --- | --- | --- |
| Inventario y prioridades / 1–2, 55–56 | Inventario, reportes y fingerprint de código | Comprobado localmente |
| Sesión, cookies y propiedad / 3–19 | API-01–04, S21-04–05, S21-UI-01 y fixture HTTPS | Comprobado localmente |
| Abuso / 20 | S21-01–03, S21-11–12 y S21-UI-02 | Comprobado localmente |
| Idempotencia y atomicidad / 21–29 | API-02, API-12–13, API-15, API-17 | Comprobado localmente |
| Concurrencia y mantenimiento / 30–38 | API-19–21, S21-07–08, S21-14 y logs acotados | Comprobado localmente |
| Contactos e integridad / 39–47 | API-22–23, S21-06 y catálogo SQL | Comprobado localmente |
| Eficiencia / 48–50 | Benchmark antes/después y planes saneados | Comprobado en el escenario local |
| Seguridad BD / 51–52 | Rol local, S21-06, S21-10, S21-13 y db:audit | Comprobado localmente; pendiente evidencia externa |
| Recuperación / 53–54 | Migración desde cero/anterior, reinicio y S21-09 | Comprobado localmente; pendiente evidencia externa |

## Rendimiento, recuperación y operación

El benchmark usa clúster propio con 1.000 sesiones, 3.000 recorridos, 15.000 eventos y 10.000 contactos sintéticos. Las copias volumétricas sirven para cardinalidad/planes y no se presentan como evidencia de operaciones válidas de la demo. Mide Next dev calentado, no rendimiento de producción; separa planes SQL y latencia HTTP. Tres repeticiones con concurrencia 1/8 y p50/p95. Presupuesto por comparación: máximo de p95 base × 1,25 y p95 base + 50 ms. No se añaden índices salvo mejora de al menos 20 % en las tres repeticiones y sin regresión de escrituras fuera del presupuesto.

Las 18 comparaciones cumplieron el presupuesto y tuvieron cero errores. Promedio de los p95 de tres repeticiones, en milisegundos:

| Lectura | Concurrencia | Antes | Después |
| --- | ---: | ---: | ---: |
| Sesión | 1 | 78,29 | 24,12 |
| Sesión | 8 | 283,00 | 166,81 |
| Recorrido | 1 | 120,39 | 40,13 |
| Recorrido | 8 | 550,59 | 313,63 |
| Trazabilidad | 1 | 221,39 | 46,33 |
| Trazabilidad | 8 | 703,59 | 345,72 |

Estos valores no demuestran una mejora causal ni predicen producción: incluyen variabilidad de desarrollo, cachés y máquina. No se añadió un índice de optimización. Un pase diagnóstico posterior e independiente con pg_stat_statements registró 5/8/12 sentencias por lectura de sesión/recorrido/trazabilidad, incluidas transacciones; cero errores y máximo de dos conexiones de aplicación. Sus muestras de espera se guardan junto a los agregados; no contienen texto de consultas, parámetros ni filas y no se mezclan con la comparación temporal.

Rollback SQL no revierte Hedera. Tras commit e interrupción, conciliar la misma identidad externa; no enviar otra a ciegas. Tras una migración fallida, revisar estado y checksum con la conexión administrativa y ensayar reparación en copia antes de reintentar; no editar migraciones aplicadas. Revertir código mantiene la tabla aditiva de límites. Para restaurar, usar backup sintético en BD descartable y comprobar evidencia; backup, restauración y durabilidad del proveedor siguen requiriendo comprobación externa.

No declarar aceptación global mientras falten permisos/TLS efectivos del proveedor, ejecución del cron desplegado, backup/restore remoto y mediciones del candidato. El CLI de auditoría solo consulta y no aprovisiona, migra ni transmite a Hedera.

Para aplicar posteriormente en el entorno objetivo, con autorización de operación y un backup verificado:

1. Revisar TimeZone anterior y DB-HISTORIC-TIME con la conexión seleccionada. El control compara eventos con su payload; no reconstruye el origen horario de sesiones o borradores. Detener la actualización si hay diferencias históricas y ensayar una reparación por separado, sin reescribir hashes ni evidencia automáticamente.
2. Aplicar la migración aditiva con la conexión administrativa explícita, antes de activar la aplicación nueva. No editar las cuatro migraciones anteriores.
3. Conceder al login de ejecución los permisos de la matriz anterior, incluyendo RequestRateBucket, y conservar al migrador como propietario separado. Configurar la conexión pooled de ejecución y la conexión directa administrativa en sus variables correspondientes.
4. Ejecutar db:audit con el login de ejecución y verificar preflight, HTTP, navegador y cron en ese entorno. Completar evidencia remota de TLS, pooler, política de red, backups y presupuesto antes de afirmar aceptación global.
5. Si se revierte la aplicación, conservar la tabla aditiva; revisar su limpieza operativa mientras se use una versión anterior. Rollback del código, recuperación SQL y conciliación de Hedera siguen siendo procedimientos separados.

Esta implementación solo aplicó migraciones y permisos en clústeres de prueba descartables. La base habitual del proyecto y los recursos del proveedor quedan para ese procedimiento posterior.

## Comandos y evidencia reproducible

Usar Node 24; en este workspace está en `.tools/node/node-v24.22.1-win-x64`. Incorporar ese directorio al PATH de la sesión antes de usar npm.

- `npm run db:audit -- --env-file ARCHIVO`: auditoría de solo lectura con entorno explícito, sin fallback. Código 0 significa controles locales de la conexión aprobados; no significa aceptación del proveedor. Loopback sin TLS se identifica como excepción local. La conexión remota debe comprobar TLS y permisos efectivos.
- `npm run test:api`: 28 pruebas de regresión más 15 casos S21, PostgreSQL descartable, rol de aplicación restringido y Hedera controlado. `npm run test:cli`: 19 checks offline. Tipos, esquema y build se comprueban por separado.
- `npm run s21:benchmark -- baseline` antes de cambios y `npm run s21:benchmark -- after` después: crea solo un clúster descartable propiedad del arnés; no acepta URL de proveedor. El pase posterior incluye un diagnóstico SQL separado.
- `npm run s21:https` después del build: arranca el build normal de producción con base descartable, sin adaptadores de red simulados de producción, y verifica cookies en Chromium mediante TLS local efímero. Se tolera el certificado autofirmado únicamente en ese navegador de prueba. No contacta Hedera ni demuestra certificados del proveedor.
- `npm run s21:report`: sintetiza casos de API/navegador, HTTPS, presupuesto y diagnóstico SQL; deja controles ausentes bloqueados/parciales. Los reportes incluyen revisión y fingerprint de código.

Para una repetición focalizada, conservar primero la corrida original como `.cache/s21/browser-full-report.json` y generar la matriz con `npm run s21:report -- --browser-base .cache/s21/browser-full-report.json`. Solo combina snapshots de la misma revisión y requiere observaciones nuevas; cada caso repetido sustituye su resultado anterior aunque falle o quede incompleto. Los archivos originales no se reescriben. La selección de base es explícita para no reutilizar silenciosamente resultados de otra ejecución.

La corrida de navegador original registró 30 aprobados y dos fallos de S21-UI-01 por metadata SameSite en WebKit; se conservó en browser-full-report.json y sus trazas en `.cache/s21/browser-initial-artifacts`. La repetición con comprobación del encabezado aprobó S21-UI-01 en Chromium/WebKit y claro/oscuro (4/4), sin cambios en la aplicación. La matriz combina esas observaciones explícitamente y conserva las huellas de sus fuentes. Una comprobación posterior, con reporter estándar para preservar el informe completo de API, aprobó S21-06 y S21-09: CLI real con permisos restringidos y backup/restauración del payload, digest, estado confirmado e identidad del envío.

Artefactos locales: `.cache/s21/api-baseline.json`, `api-report.json`, `benchmark-baseline.json`, `benchmark-after.json`, `benchmark-comparison.json`, `query-metrics.json`, `https-cookie.json` y `control-matrix.json`; navegador en `.cache/e2e/report.json`. Son evidencia de esta ejecución, no ficheros para versionar ni datos de producción.

Referencias verificadas: [comportamiento de fechas reportado en Prisma](https://github.com/prisma/orm/issues/26786), [parámetros de sesión de PgBouncer](https://www.pgbouncer.org/config#track_extra_parameters), [opciones de SSL de node-postgres](https://node-postgres.com/features/ssl) y [cabeceras de ingreso de Vercel](https://vercel.com/docs/headers/request-headers). La reproducción local con las versiones instaladas y sus pruebas es la evidencia del cambio UTC; las referencias no sustituyen comprobación del recurso remoto.

En WebKit emulado sobre Windows se observó metadata de cookie SameSite=None aunque la respuesta capturada contiene SameSite=lax. El caso de navegador verifica la política en Set-Cookie y comprueba HttpOnly, alcance y ausencia en JavaScript/almacenamiento, conservando ambos valores como observación sin credencial. Chromium sobre HTTPS de producción local también comprueba SameSite=Lax en la cookie instalada. Esto no certifica el comportamiento de Safari en un dispositivo real.
