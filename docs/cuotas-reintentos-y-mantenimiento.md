# S10 · Cuotas, reintentos y mantenimiento diario

Implementado en `feature/s10-cuotas-reintentos-y-mantenimiento`. Presupuesto cero: PostgreSQL compartido, Vercel Hobby y Hedera testnet; sin Redis, colas ni programadores externos.

## Guardado y ejecución acotada

Los comandos de S08 confirman primero su transacción SQL. Si crean o recuperan un hito, registran trabajo con `after` de Next.js: la respuesta conserva `saved: true` aunque no se pueda registrar o completar ese trabajo. GET de recuperación no envía mensajes. Cada activación intenta atender hasta cinco eventos del recorrido, en secuencia, sin esperas ni bucles de polling.

El coordinador compartido por Next.js y CLI recibe transacciones SQL, proveedor HCS, entorno y reloj. No mantiene cuotas en memoria. El lease por publicación dura 90 segundos. Cada escritura comprueba propietario, vigencia del recorrido y preparación esperada. Las llamadas de red ocurren fuera de SQL; el trabajador anterior no puede sobrescribir a quien recuperó su lease. Una transacción con marcador de envío solo se reconcilia, aunque una caída haya ocurrido antes del contacto efectivo con la red.

Los hitos posteriores esperan la confirmación de **todos** sus predecesores. Un rechazo agotado tampoco habilita adelantarlos. Esta espera afecta a HCS; la operación local puede continuar. La selección descarta en SQL los hitos bloqueados para que no impidan atender otros recorridos.

## Cuota y registro de intentos

`HCS_DAILY_LIMIT` admite enteros de 1 a 100; sin valor usa 100. La capacidad `hcsQuota()` se valida independientemente de las claves HCS. La cuota `HCS_GLOBAL` comparte contador entre instancias, recorridos, topics y generaciones, por día UTC. Una actualización condicional dentro de una transacción serializable reserva cupo junto con el contador de intento y el marcador previo al envío.

Hay tres intentos automáticos totales por evento, incluido el inicial, y un único intento adicional autorizado por su propietario. `HcsSubmissionAttempt` conserva slot, clase, ID, bytes firmados, destino/generación, día reservado, resultado y prueba. La preparación de un intento que pudo enviarse es inmutable. Preparaciones sustituidas antes de un envío comprobado quedan archivadas en la historia privada. No se exponen esos bytes ni la historia técnica por HTTP.

Un timeout, UNKNOWN, 404, receipt ausente o vencimiento del ID no permiten fabricar otra transacción. Solo un rechazo definitivo de precheck/receipt/mirror permite avanzar al siguiente slot. Un resultado local `not_sent` permite reutilizar el slot reservado, con preparación nueva si corresponde; no consume otro intento. Las reservas no se devuelven automáticamente, ni siquiera cuando se comprobó ausencia de envío. Si se reutiliza un slot otro día UTC, se reserva también en ese día. Esta política conservadora puede desperdiciar cupo, pero no convierte incertidumbre en un reenvío ciego.

La migración conserva contadores anteriores. Preparaciones antiguas con marcador o contador pasan a un intento incierto, conservando su identidad; no se inventan IDs de intentos históricos desconocidos. Contadores antiguos sin preparación hacen fallar la migración y requieren revisión explícita.

## Elegibilidad y estados

| Situación | Siguiente elegibilidad |
| --- | --- |
| Hito nuevo | Inmediata |
| Primer rechazo automático recuperable | Un minuto después |
| Segundo rechazo automático recuperable | Cinco minutos después |
| Resultado incierto | Reconciliación desde un minuto después |
| Configuración, saldo, dependencia o prueba local de ausencia de envío | Quince minutos después |
| Cuota agotada | Siguiente medianoche UTC |
| Tres rechazos automáticos agotados | Espera autorización manual |
| Intento manual rechazado | Sin más envíos |
| Verificación pendiente/no disponible | Quince minutos después |
| Verificación MATCHED/MISMATCH | Sin repetición periódica |

Son fechas de elegibilidad, no promesas de ejecución puntual. Los únicos disparadores son interacción que guarda un hito, POST privado de reintento y mantenimiento diario/administrativo. Tras enviar se intenta reconciliar dentro del presupuesto disponible. La confirmación histórica nunca se borra por indisponibilidad posterior; confirmación y contraste siguen siendo ejes independientes.

La proyección privada añade `automaticAttempts`, `manualAttempts`, `manualAuthorized`, `manualAvailable`, `nextAttemptAt`, `blockedBy` y `quota`. La cuota informa `limit`, `used`, `remaining` y `resetsAt`; límite y restante son null si su configuración es inválida. El GET del recorrido calcula cuota una vez y deriva los bloqueos del historial ordenado. No publica propietario del lease, claves, cookie, contactos, bytes o generación interna.

## Reintento privado

```text
POST /api/demo/runs/{traceId}/events/{eventId}/retry
Content-Type: application/json
Origin: APP_URL
X-Jopoi-Request: demo

{"requestId":"UUID"}
```

Usa la cookie de S04, sesión vigente y propiedad del recorrido/evento. El cuerpo es estricto y de hasta 4096 bytes; no acepta rol ni versión operativa. Nueva intención devuelve 202; repetición idéntica, 200. La respuesta tiene `saved`, `replayed`, `traceId`, `eventId`, el `outcome` original, publicación actual y cuota actual. Los outcomes son `ALREADY_CONFIRMED`, `BLOCKED`, `RECONCILE_ONLY`, `MANUAL_AUTHORIZED`, `EXHAUSTED` y `AUTOMATIC_PENDING`.

Reutiliza `CommandReceipt` con acción `RETRY_PUBLICATION`, hash de versión/acción/evento y namespace `(runId, requestId)`. Cambiar de acción o evento con la misma clave produce 409. No modifica versión operativa ni crea otro evento. Un replay conserva el resultado lógico original, aunque la publicación actual haya avanzado. Una nueva intención tampoco evade cooldown, cuota, orden o lease.

Antes de agotar los automáticos solo activa trabajo elegible. Si queda incertidumbre, solo reconcilia y no consume el adicional manual. Tres rechazos automáticos permiten autorizar el adicional una vez; esa autorización sobrevive a cuota agotada o configuración incompleta. Repetir solicitudes no agrega slots.

## Mantenimiento diario

`vercel.json` configura únicamente `GET /api/cron` a `0 3 * * *`, UTC. Es una ruta Node dinámica con `maxDuration = 60` y respuestas privadas sin caché. `CRON_SECRET` se valida antes de cualquier acceso SQL: ausente/inválido da 503; bearer incorrecto, `MAINTENANCE_UNAUTHORIZED`/401. La comparación usa `timingSafeEqual`. No exige Origin, cookie ni header de navegador.

Un lease global de 120 segundos evita barridos simultáneos. Una ejecución completa registra el día UTC y las invocaciones cron posteriores de ese día se omiten. Una ejecución parcial puede retomarse. El CLI explícito puede volver a revisar un día ya completado, respetando el lease y todos los límites de publicaciones.

La limpieza precede a HCS y contempla hasta 100 filas por categoría y una ventana de 15 segundos, dejando margen para el timeout SQL:

- Recorridos vencidos a siete días y sus datos por cascada. Se omiten los que tienen un lease de publicación activo.
- Contactos vencidos a 90 días.
- Sesiones vencidas sin recorridos conservados.
- Cuotas anteriores a ocho días UTC.
- Leases de publicación vencidos, sin alterar sus contadores ni resultados.

`cleanupComplete` solo es true tras comprobar que no quedan filas elegibles, incluidos recorridos vencidos protegidos por otro trabajador. La respuesta informa conteos, publicaciones procesadas, `hasMore`, código de dependencia cuando corresponda y `complete`. Alcanzar un límite de lote o tiempo no se presenta como borrado completo. Un fallo HCS posterior no revierte la limpieza ya confirmada. El acceso a datos vencidos sigue bloqueado desde el vencimiento, aunque el borrado físico todavía esté pendiente.

El presupuesto cooperativo total es 45 segundos. Reserva margen para cierre SQL, toma hasta diez eventos secuenciales y no inicia una llamada de red sin tiempo suficiente para su timeout acotado. Puede atender menos eventos si la limpieza, SQL o la red consumen ese margen. `hasMore` refleja trabajo actualmente elegible; los cooldowns, el agotamiento definitivo y los predecesores sin confirmar siguen visibles como pendientes, pero no producen bucles. Una terminación forzada deja leases recuperables y marcadores durables.

Vercel Hobby invoca Cron una vez al día con precisión horaria aproximada; no garantiza recuperar ejecuciones perdidas ni reintenta automáticamente fallos. [Límites de Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [autenticación y operación](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [after de Next.js](https://nextjs.org/docs/app/api-reference/functions/after). El despliegue y la comprobación externa corresponden a S16/S18.

## Administración y verificación realizada

```text
npm run maintenance -- --help
npm run maintenance -- --run
npm run maintenance -- --run --local-only
```

`--help` no carga entorno, SQL ni SDK. `--run` modifica SQL, borra vencidos y puede enviar a testnet. `--local-only` exige SQL en `127.0.0.1:54321/jopoi`; **no desactiva Hedera**. No hay una modalidad de simulación que finja confirmaciones. La salida se limita a conteos, estados y códigos, sin PII, credenciales o bytes.

Se comprobaron generación/validación Prisma, TypeScript, build de producción y ayuda del CLI. Se aplicó `202610230003_publication_coordination` exclusivamente a PostgreSQL local y `db:status -- --local-only` confirmó cuatro migraciones al día; el servicio volvió a detenerse conservando datos. No se ejecutó el trabajador, limpieza de negocio, cron ni envío HCS. No se migró Neon ni se desplegó, creó commit o añadieron dependencias.

S17 verificará por API y reloj controlado las carreras de cuota/leases, los 3+1 intentos, recuperación tras caída, orden, cooldowns, idempotencia, autorización y limpieza parcial. S18 completará navegador y comprobación separada de testnet real. No se crearon ni ejecutaron suites en S10.
