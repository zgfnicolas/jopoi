# S22-10 · Admisión diaria de sesiones y solicitudes de demo

## Separación entre admisión de solicitudes y creación efectiva

El servicio mantiene las cuatro ventanas técnicas de solicitudes por ventana UTC fija (`SESSION`: 20 por visitante y 200 global cada 600 s; `CONTACT`: 5 por visitante y 100 global cada 3600 s; `VERIFICATION`: 30/300 cada 60 s; `TRACE`: 120/1000 cada 60 s) e incorpora dos techos globales iniciales de creación diaria UTC:

- `SESSION_CREATE`: **100 sesiones nuevas por día UTC** (`DEMO_POLICY.sessionDailyLimit = 100`).
- `CONTACT_CREATE`: **100 solicitudes de contacto nuevas por día UTC** (`DEMO_POLICY.contactDailyLimit = 100`).

La tabla `DailyQuota` continúa reservada exclusivamente para el cupo diario de negocio de publicaciones en Hedera (`HCS_GLOBAL`). Las reservas diarias de creación técnica se registran en `RequestRateBucket` mediante la migración aditiva [`202611020001_daily_creation_admission`](../prisma/migrations/202611020001_daily_creation_admission/migration.sql), que amplía `RequestRateBucket_scope_check` con `'SESSION_CREATE'` y `'CONTACT_CREATE'` sin relajar privilegios ni tocar filas previas. El inventario de preflight de entrega verifica la presencia de esta migración y que ambos límites valgan `100`.

Las solicitudes pasan primero por la ventana técnica (`requireRateLimit`) y sólo consumen `SESSION_CREATE` o `CONTACT_CREATE` cuando crean una fila nueva:

- En `POST /api/demo/session`, si el visitante presenta una cookie de sesión vigente, `beginSession` devuelve la sesión activa (`200`, `created: false`) sin consumir `SESSION_CREATE`. Si no hay sesión vigente, un único CTE SQL atómico incrementa `SESSION_CREATE` en `RequestRateBucket` bajo la condición `used < 100` e inserta `DemoSession` únicamente si la reserva obtuvo cupo.
- En `POST /api/demo-requests`, `submitDemoRequest` ejecuta en una transacción `ReadCommitted` un `INSERT INTO "DemoRequest" ... ON CONFLICT ("requestId") DO NOTHING RETURNING "id", "createdAt"`. Sólo cuando se inserta una fila nueva se ejecuta `reserveDailyCreation(tx, "CONTACT_CREATE", now)`. Si el techo diario ya alcanzó `100`, `RateLimitError` revierte la transacción completa sin dejar escritura parcial; si el `requestId` ya estaba confirmado y vigente con el mismo `intentHash`, se responde `200` sin consumir otro cupo diario de creación.
- El corte diario se calcula en UTC (`Date.UTC(year, month, date)`) con vencimiento de retención del bucket a las 48 horas del cierre del día UTC y `Retry-After` exacto en segundos hasta la medianoche UTC siguiente. Si el contador o la configuración no están disponibles, la operación falla cerrada (`503`) sin degradar a memoria local.

## Identidad de visitante para NAT, IPv6 e ingreso confiable

[`src/server/security/visitor-identity.ts`](../src/server/security/visitor-identity.ts) centraliza la normalización de red y la derivación criptográfica del sujeto de visitante:

1. **Ingreso confiable:** [`src/server/runtime/client-identity.ts`](../src/server/runtime/client-identity.ts) sólo inspecciona `x-vercel-forwarded-for` cuando `process.env.VERCEL === "1"`. Fuera de ese ingreso devuelve `"local-shared"`, ignorando cualquier cabecera reenviada.
2. **Validación y agrupación de red:** Cuando el ingreso es confiable pero la cabecera falta, contiene múltiples direcciones o no es un literal IP válido, se agrupa en `"unknown-shared"`. Las direcciones IPv4 y las IPv6 mapeadas desde IPv4 (`::ffff:a.b.c.d`) se canonizan al mismo identificador `"ipv4:a.b.c.d/32"` para compartir el cubo del NAT. Las direcciones IPv6 nativas se canonizan y agrupan por sus primeros cuatro hextetos (`"ipv6:xxxx:xxxx:xxxx:xxxx::/64"`), evitando que la rotación de sufijos de interfaz (RFC 8981) multiplique el cupo por visitante.
3. **Derivación HMAC con rotación diaria UTC:** `visitorSubject(secret, at, scope, identity)` exige un `SESSION_SECRET` válido (fallando cerrado con `CONFIGURATION_UNAVAILABLE` si falta o es corto), deriva una subclave diaria UTC (`s22-visitor-key-v1\0YYYY-MM-DD`) y calcula un segundo HMAC-SHA-256 separado por ámbito (`s21-rate-v1\0<scope>\0<identity>`). Ni la IP cruda ni el prefijo `/64` se persisten en SQL ni se escriben en logs.

## Contrato HTTP y preservación de intención en el navegador

- [`scripts/lib/openapi.ts`](../scripts/lib/openapi.ts) y [`public/openapi.json`](../public/openapi.json) documentan en `x-rate-limit` tanto las ventanas por solicitud como el techo global de 100 creaciones nuevas por día UTC en `POST /api/demo/session` y `POST /api/demo-requests`.
- Cuando se alcanza el techo diario, el boundary responde `429` con `Retry-After` (segundos restantes hasta el siguiente día UTC) y negocia `application/problem+json` o el sobre JSON compatible según `Accept`.
- En el formulario de contacto, recibir `429` por agotamiento del techo diario conserva todos los campos editados y el `requestId` capturado; al avanzar el día UTC y accionar manualmente «Reintentar guardado», se envían exactamente los mismos bytes y se confirma la solicitud (`201`).

## Evidencia local

### Controles rápidos y hallazgo inicial de concurrencia

- En la primera corrida de pruebas unitarias, el caso `S22-04` detectó que `normalizeClientAddress` devolvía `"ipv4:203.0.113.25"` sin el sufijo `/32` y que `strict-report` señalaba 6 diagnósticos de tipos en las pruebas nuevas (el tipo literal de `Visitor.identity` en `tests/support/client.ts` y la firma de `visitorSubject` para secretos opcionales). Se ajustaron ambos puntos, quedando el informe estricto en **cero diagnósticos** (`npm run typecheck:report`) y aprobando `7/7` pruebas en `tests/cli/seguridad.test.ts`.
- En la primera corrida de `tests/api/seguridad.test.ts`, aprobaron `17/18` casos (incluidos `S22-01`, `S22-04` y `S22-05`), mientras que `S21-01` (24 inicios de sesión concurrentes sin cookie entre dos instancias) registró errores `P2028` al encadenar una segunda transacción interactiva multi-consulta en `beginSession` sobre el pool de 2 conexiones. Al reemplazar la creación sin cookie previa por un único CTE SQL atómico (`WITH quota AS (...) INSERT INTO "DemoSession" ...`) y alinear `maxWait: 5000` en las transacciones de admisión, `S21-01`, `S22-01`, `S22-04` y `S22-05` aprobaron juntos en 47,2 segundos.

### Navegador (Chromium desktop y WebKit móvil)

- En una primera ejecución de `tests/e2e/seguridad.spec.ts` sin filtro de proyectos (12 combinaciones incluyendo temas oscuros), aprobaron `11/12` casos —incluidas las cuatro variantes de `S22-UI-01` y `S21-UI-02`— y sólo el primer arranque en frío de `S21-UI-01` en `chromium-desktop` excedió los 20 segundos esperando `POST /api/demo/session`.
- La ejecución focalizada en `chromium-desktop` y `webkit-mobile` aprobó **6/6 escenarios** (`S21-UI-01`, `S21-UI-02` y `S22-UI-01`) en 4,2 minutos (`.cache/s22-10-e2e.log` y `.cache/e2e/report.json`).
- Observación de navegador: `2026-11-02T11:46:26.778Z`; revisión base `0b5ffd9fb14654e9ef893c14d7bbdc72b674d222` (`dirty: true`); huella de fuentes `1f74a61af4a564de1af3c2d5a00561e649ba1fea618efa59da54911bd3088aa8`.

### Puerta integral reproducible (`npm run quality:check`)

`npm run quality:check` aprobó en su primera ejecución con código de salida `0` (`.cache/s22-10-quality.log`):

- `db:generate`, `db:validate`, `typecheck`, `typecheck:api`, `lint` y `api:check`: aprobados.
- `typecheck:report`: **0 diagnósticos** en el perfil estricto global obligatorio (`.cache/quality/strict-report.json`).
- `test:contracts`: **8/8** aprobadas.
- `test:quality`: **9/9** aprobadas.
- `test:security`: **7/7** aprobadas.
- `test:domain`: **54/54** aprobadas.
- `test:observability`: **4/4** aprobadas.
- `test:cli`: **24/24** aprobadas (incluyendo `S22-04` para normalización NAT/IPv6 `/64` y rotación diaria UTC del HMAC).
- `test:ui:tokens`: **2/2** aprobadas.
- `test:api`: **8 archivos, 58/58 pruebas HTTP aprobadas** en 406,63 s (`S22-01`, `S22-04` y `S22-05` incluidos junto con la regresión completa `API-01..26`, `S21-01..15` y `S22-08..12`).
- `build`: compilación de producción Next.js 16.4.2 aprobada.

Observación HTTP: `2026-11-02T11:59:08.910Z`, `startupErrors: 0`, revisión base `0b5ffd9fb14654e9ef893c14d7bbdc72b674d222` (`dirty: true`) y huella de fuentes `1f74a61af4a564de1af3c2d5a00561e649ba1fea618efa59da54911bd3088aa8`, idéntica a la registrada en la corrida de navegador. Todas las pruebas se ejecutaron contra PostgreSQL efímero aislado y ledger HCS controlado, sin usar la base habitual ni enviar transacciones reales a Hedera testnet.
