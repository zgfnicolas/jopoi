# Sesiones anónimas y aislamiento

S04 implementa acceso anónimo privado, recuperación, inicio y reinicio de recorridos. Se desarrolló en `feature/s04-sesiones-y-aislamiento` desde `main` con S03 integrada. No representa cuentas de empresas ni firmas independientes de los roles simulados.

## Preparación y ejecución local

Se conservan las versiones de S03 y PostgreSQL portable. Preparar `DATABASE_URL`, `DIRECT_URL` y un `SESSION_SECRET` privado de al menos 32 caracteres, generado con 32 bytes aleatorios. No versionarlo, imprimirlo ni reutilizar `CRON_SECRET`. La aplicación necesita solo las capacidades que utiliza: estas rutas no requieren Hedera ni cron.

En este workspace S04 generó el secreto faltante en `.env.local`, ignorado por Git, sin mostrar su valor. No se añadió a `.env.example`; una copia nueva necesita configurar su propio secreto.

Con Node 24 y npm disponibles en PATH:

```powershell
npm run db:generate
npm run db:local
npm run db:migrate -- --local-only
npm run db:status -- --local-only
npm run db:check -- --local-only
npm run typecheck
npm run build
npm run dev
```

En este workspace Node está en `.tools/node/node-v24.22.1-win-x64`; se puede anteponer temporalmente al PATH de PowerShell como en S01/S03. `dev` escucha en `127.0.0.1:3000`, origen predeterminado de desarrollo. Si se usa otro origen, configurar `APP_URL` explícitamente. En producción `APP_URL` es obligatorio y HTTPS; `start` necesita un build previo y esa configuración. Al terminar, `npm run db:local:stop` conserva los datos.

Next.js compila y sirve los endpoints de S04; todavía no hay landing ni panel operativo. La página raíz puede devolver 404. `next-env.d.ts` incorpora las referencias de tipos generadas por Next al compilar.

## Contrato HTTP

Todas las respuestas de los handlers, incluidos errores, usan `Cache-Control: private, no-store` y `Vary: Cookie`. No se comparten mediante caché ni se habilita CORS. Las fechas son cadenas ISO UTC; los estados operativos usan los valores técnicos en mayúsculas de S03.

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| `POST /api/demo/session` | JSON `{}` | 201 crea sesión y emite cookie, sin crear recorrido. 200 conserva una sesión vigente y recupera su resumen sin reemitir cookie. |
| `GET /api/demo/session` | Cookie privada | 200 recupera resumen de sesión y recorrido activo; no crea datos. |
| `POST /api/demo/runs` | JSON `{ requestId: UUID }` | 201 crea el primer recorrido; 200 retoma el activo o recupera una intención ya resuelta. |
| `POST /api/demo/runs/reset` | JSON `{ requestId: UUID }` | 201 crea otro recorrido; 200 recupera una intención de reinicio ya resuelta. |

Los POST requieren `Origin` exactamente igual al origen configurado, `Content-Type: application/json` y `X-Jopoi-Request: demo`. También se admiten parámetros del tipo de contenido, como charset. El cliente usa solicitudes del mismo origen con sus cookies. Se rechaza origen ausente, `null` o diferente, sin confiar en Host/X-Forwarded-Host. El header personalizado y la ausencia de CORS complementan la cookie SameSite: no se depende únicamente de SameSite para impedir CSRF. Ver [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) y [Route Handlers de Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/route).

Solo se aceptan atributos definidos y cuerpos de hasta 4096 bytes. Se comprueba el stream aunque falte Content-Length; JSON, UTF-8 o UUID inválidos se rechazan con `INVALID_INPUT`. Los UUID de intención se normalizan a minúsculas.

Los DTO compartidos están en `src/shared/session-contracts.ts`:

- Sesión: `{ expiresAt, runCount, remainingRuns }`.
- Recorrido resumido: `{ traceId, state, version, expiresAt }`.
- Recuperación/bootstrap: `{ session, activeRun }`, con `activeRun: null` antes del primer recorrido.
- Inicio/reinicio: `{ session, run, created, replayed }`. `created` solo indica creación en esta petición y determina el 201; `replayed` indica una intención ya resuelta. Ambos pueden ser falsos al retomar un recorrido con una clave nueva.

El recorrido activo es el de mayor ordinal vigente. Repetir una intención anterior puede devolver otro recorrido distinto del actualmente activo: siempre el asociado originalmente a esa clave, con su estado y versión vigentes. Para consultar el activo se usa GET de sesión. S08 añadirá los DTO completos, consultas privadas por traceId y comandos; S11 implementará la proyección compartible.

El `requestId` del cuerpo identifica una intención estable: el cliente genera un UUID una vez y lo conserva al reintentar. El `error.requestId` de S01 es otro identificador, generado por el servidor para diagnóstico. No se copia de headers ni de la clave idempotente.

## Credencial, vencimiento y propiedad

El servidor genera 32 bytes criptográficamente aleatorios y los codifica como base64url. El token solo viaja en la cookie `jopoi_session`: HttpOnly, SameSite=Lax, Path=/, sin Domain y Secure en producción. SQL conserva únicamente su HMAC-SHA-256 hexadecimal mediante `SESSION_SECRET`. Cambiar ese secreto invalida las credenciales existentes; no recupera sesiones anteriores.

La sesión vence 24 horas después de crearse. La cookie inicial lleva Expires y Max-Age limitados al plazo restante; lecturas, recuperaciones, reinicios y bootstrap de una sesión vigente no la renuevan. El servidor comprueba el vencimiento aunque se presente manualmente una cookie caducada.

Una sesión reconocida pero vencida produce `SESSION_EXPIRED`/401. Cookie ausente, inválida o desconocida produce `SESSION_REQUIRED`/401. Si el navegador ya eliminó una cookie vencida, el servidor solo puede observar que falta. El futuro frontend podrá explicar el vencimiento usando la fecha obtenida previamente.

Solo una nueva llamada explícita a `POST /api/demo/session` permite sustituir una sesión vencida o inválida. Los endpoints de recorridos nunca crean una sesión como fallback. El visitante con sesión vigente tampoco obtiene un cupo nuevo llamando de nuevo al bootstrap. Borrar cookies sí puede crear otra sesión: el cupo no identifica a una persona o dispositivo.

El cliente debe completar el bootstrap antes de iniciar recorridos y serializar ese paso. Dos solicitudes iniciales sin cookie todavía no comparten identidad; pueden crear sesiones diferentes. Si se pierde la respuesta antes de recibir la cookie, no se promete recuperar esa sesión. S12/S14 incorporarán esta coordinación del navegador.

`requireSession` y `requireOwnedRun` son guardas privadas reutilizables dentro de la misma transacción que la lectura o escritura autorizada. La segunda filtra por traceId, propietario y vencimiento del recorrido. Para una sesión válida, un recorrido ajeno, inexistente o fuera de vigencia devuelve el mismo `NOT_FOUND` sin revelar datos. El llamador valida el UUID en la frontera HTTP, como harán las rutas de S08.

Estas rutas solo devuelven resúmenes permitidos, nunca modelos Prisma completos, IDs internos de sesión/recorrido, hashes, tokens ni datos técnicos de publicación. El traceId localiza; no autoriza. El rol representado no cambia la identidad ni la propiedad; S06/S08 aplicarán la correspondencia entre acción y rol.

## Atomicidad e idempotencia

La nueva migración `202610230001_session_intents` añade `SessionIntentKind` y `SessionRunIntent`, sin modificar la migración inicial. La clave primaria es `(sessionId, requestId)`. Cada recibo conserva START/RESET y su recorrido. La FK compuesta exige que el recorrido pertenezca a esa sesión; al eliminarlo, sus recibos se eliminan en cascada.

Los recibos incluyen intenciones que solo retoman un recorrido. Guardar únicamente `DemoRun.creationRequestId` no permitiría repetir esas claves después de un reinicio. Las claves de creación anteriores a S04 se migran como START. Los recibos quedan durante la retención del recorrido, sin un borrado anticipado separado.

En una transacción serializable se verifica sesión, se busca el recibo previo y después se resuelve la intención. La misma clave con START y RESET diferentes devuelve `IDEMPOTENCY_CONFLICT`/409. La intención previa se consulta antes del cupo: repetirla sigue funcionando con tres recorridos utilizados.

START retoma el activo; si no existe, crea el primero. RESET crea otro, sin exigir cierre del anterior. La creación reserva el siguiente ordinal incrementando condicionalmente el contador vigente y guarda el recorrido y su recibo en la misma transacción. El cuarto recorrido produce `RUN_LIMIT_REACHED`/429. No se borran recorridos anteriores ni se amplían las 24 horas.

Cada recorrido empieza en DRAFT, versión 1, con traceId aleatorio, snapshot independiente de S02, declaración inicial normalizada y vencimiento siete días después de su creación. No genera CommandReceipt operativo, evento, pendiente HCS ni mensaje de red.

Ante conflicto de serialización o unicidad se revierte la transacción. Una nueva lectura autorizada busca la intención ya confirmada: si existe, devuelve ese recorrido; si no, devuelve cupo agotado para RESET o `VERSION_CONFLICT`/409. No hay reintento automático de creaciones. El cliente conserva su requestId para un reintento explícito. El contador y las restricciones de S03 siguen impidiendo un cuarto ordinal.

## Errores, evidencia y pendientes

Se conserva el contrato `{ error: { code, message, requestId, fields? } }` de S01. S04 añade `REQUEST_FORBIDDEN`/403 para origen o header de protección rechazados. Errores SQL conocidos siguen mapeando a `DATABASE_UNAVAILABLE`/503; configuración requerida ausente o inválida a `CONFIGURATION_UNAVAILABLE`/503. No se publican errores crudos, cookies, consultas ni mensajes del proveedor.

Comprobado durante S04: schema válido, cliente generado, TypeScript, build de Next.js con los tres paths de API, aplicación local de la nueva migración, historial actualizado y SELECT 1 real. Estas comprobaciones no acreditan todavía el comportamiento de los endpoints. Al cerrar se detiene PostgreSQL y se conservan los datos.

No se crean ni ejecutan suites en S04. Quedan para S17/S18: recuperación sin renovar vencimiento; cuota concurrente; reintentos antes y después de reiniciar y con cupo agotado; claves cruzadas START/RESET; aislamiento entre propietarios; sesión/recorrido vencidos; origen/header rechazados; entradas y límites de tamaño; ausencia de secretos; pérdida de cookie; fallos SQL sin escritura parcial; atributos de cookie y coordinación del bootstrap en navegador.

La guarda de propiedad quedará conectada a las consultas y comandos de S08: S04 no acredita aún esas rutas. La caducidad de sesión bloquea acceso privado, pero conserva el recorrido durante su retención. La consulta pública y el borrado diario corresponden a S11 y S10 respectivamente. No hubo despliegues ni consumo de testnet.
