# S22-16 · Cerrar sesiones y hacer efectivo el vencimiento por inactividad (`D01`, `D10`, `D18`, `AUD-13`)

## Trazabilidad y objetivos

- **Spec S22:** historias 45, 46, 47, 49, 50 y 76; decisiones `D01`, `D10` y `D18`; hallazgo de auditoría `AUD-13`; escenarios `S22-16`, `S22-17`, `S22-18` y `S22-29`.
- **Objetivo:** Permitir al visitante cerrar su sesión explícitamente (`DELETE /api/demo/session`) e implementar la expiración por inactividad (60 minutos) y absoluta (24 horas) calculada con el reloj del servidor (`wallNow()`), persistiendo la actividad con limitación (máximo una vez cada 5 minutos) y sin extender en ningún caso el límite absoluto. Garantizar que la revocación o expiración bloquee comandos, lecturas privadas (`/api/demo/runs/*`) y generación de CSRF sin eliminar evidencia pública ni registros históricos (`DemoSession`), con migración aditiva y backfill de base de datos (`202611060001_session_revocation_and_inactivity`).

---

## 1. Cierre Idempotente de Sesión (`DELETE /api/demo/session`, `D10`, `S22-16`)

El endpoint `DELETE /api/demo/session` permite la revocación inmediata de la credencial:

1. **Defensa en profundidad en mutaciones:**
   - Evaluado mediante [`requireBrowserMutation`](../src/server/http.ts).
   - Valida `Origin` confiable contra `APP_URL`, encabezado `X-Jopoi-Request: demo` y Fetch Metadata (`Sec-Fetch-Site !== "cross-site"`, `Sec-Fetch-Mode !== "navigate"`).
   - Si la petición incluye una cookie de sesión activa, exige obligatoriamente el token `X-CSRF-Token` correspondiente.
   - Permite peticiones `DELETE` sin cuerpo JSON (`Content-Type` opcional cuando no hay body).
2. **Revocación en el servidor:**
   - Ejecuta [`revokeSession`](../src/server/sessions/service.ts) sobre el token provisto.
   - Si la sesión existe y no estaba revocada, registra `revokedAt = wallNow()` en `DemoSession`.
   - Si la sesión ya estaba revocada, expirada o la petición es anónima/repetida, responde `204 No Content` de manera estrictamente idempotente. Repetir la solicitud nunca crea una sesión.
3. **Limpieza de cookies en el cliente:**
   - Emite encabezados `Set-Cookie` con `Max-Age=0` y fecha de caducidad en 1970 tanto para `__Host-jopoi_session` (en HTTPS) como para `jopoi_session`.
   - En el cliente web ([`src/frontend/use-operation-panel.ts`](../src/frontend/use-operation-panel.ts)) y en el arnés de pruebas ([`tests/support/client.ts`](../tests/support/client.ts)), se limpia inmediatamente la cookie y el token CSRF en memoria volátil.

---

## 2. Preservación Histórica y Desacople de Trazas Públicas (`D01`, `D18`)

1. **Conservación de registros padre:**
   - La fila `DemoSession` permanece almacenada en PostgreSQL con su marca temporal `revokedAt`. No se eliminan los registros padre para preservar la integridad referencial y las auditorías de operaciones previas.
2. **Independencia de trazas públicas:**
   - Los enlaces de trazabilidad pública ([`/api/traces/[traceId]`](../src/app/api/traces/[traceId]/route.ts)) y los mensajes en Hedera Consensus Service (HCS) conservan su política de retención independiente de 7 días.
   - La revocación de la sesión del participante no degrada ni elimina la trazabilidad pública de recorridos ya confirmados o publicados.
3. **Bloqueo categórico de accesos privados:**
   - Tras la revocación o expiración:
     - Cualquier intento de lectura privada (`GET /api/demo/runs/[runId]`) es rechazado con `401 Unauthorized` (`SESSION_EXPIRED` o `SESSION_REQUIRED`).
     - Cualquier intento de ejecución de comando (`POST /api/demo/runs/[runId]/commands`) o reintento de publicación es rechazado con `401 Unauthorized`.
     - `GET /api/demo/session` rechaza la emisión de nuevos tokens CSRF con `401 Unauthorized`.

---

## 3. Política de Inactividad y Límite Absoluto (`D18`, `S22-17`)

En [`src/shared/demo-policy.ts`](../src/shared/demo-policy.ts) y [`src/server/sessions/service.ts`](../src/server/sessions/service.ts):

| Regla | Parámetro | Valor | Comportamiento |
| --- | --- | --- | --- |
| **Límite Absoluto** | `sessionLifetimeSeconds` | 24 horas (`86.400 s`) | Desde `createdAt`. Fijo e inmutable. Ninguna actividad puede extenderlo. |
| **Inactividad Máxima** | `sessionIdleSeconds` | 60 minutos (`3.600 s`) | Si transcurren más de 60 minutos sin actividad autorizada desde `lastActivityAt`, la sesión expira. |
| **Limitación de Persistencia** | `sessionActivityThrottleSeconds` | 5 minutos (`300 s`) | Mutaciones autorizadas actualizan `lastActivityAt = now` como máximo una vez cada 5 minutos, protegiendo a la base de datos de sobrecarga de escritura en ráfagas. |

### Función de Verificación `isSessionActive`

```typescript
export function isSessionActive(
  session: Pick<DemoSession, "expiresAt" | "lastActivityAt" | "revokedAt">,
  at: Date = wallNow(),
): boolean {
  if (session.revokedAt !== null) {
    return false;
  }
  const atMs = at.getTime();
  if (atMs >= session.expiresAt.getTime()) {
    return false;
  }
  const idleMs = DEMO_POLICY.sessionIdleSeconds * 1000;
  if (atMs - session.lastActivityAt.getTime() >= idleMs) {
    return false;
  }
  return true;
}
```

Todas las evaluaciones temporales emplean exclusivamente el reloj del servidor (`wallNow()`).

---

## 4. Experiencia en Interfaz de Usuario y Prevención de Replay (`S22-17`)

1. **Notificación y Control en el Panel:**
   - [`src/components/operation-panel.tsx`](../src/components/operation-panel.tsx) presenta información clara al usuario sobre el ciclo de vida de la sesión (hasta 24 horas o 60 minutos de inactividad).
   - Provee un botón visible "Cerrar sesión" que dispara `endSession()`.
   - Muestra notificaciones explícitas cuando la sesión se cierra a petición del usuario o cuando expira por inactividad.
   - Retira inmediatamente la vista privada y el panel operativo al producirse el cierre o expiración.
2. **Rechazo de Replay:**
   - Intentos posteriores de reenvío de solicitudes (`replay`) o refresco de página con credenciales revocadas o inactivas reciben `401 Unauthorized` (`SESSION_EXPIRED`), sin reactivar la sesión bajo ninguna circunstancia.

---

## 5. Migración Aditiva y Coexistencia (`S22-29`)

- **Migración SQL:** [`prisma/migrations/202611060001_session_revocation_and_inactivity/migration.sql`](../prisma/migrations/202611060001_session_revocation_and_inactivity/migration.sql)
  - Incorpora `lastActivityAt TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` y `revokedAt TIMESTAMPTZ(3)`.
  - Backfill seguro: `UPDATE "DemoSession" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" IS NULL`.
- **Inventario de Preflight:**
  - Registrada en [`src/server/delivery/preflight.ts`](../src/server/delivery/preflight.ts) para verificación antes de arranque.
- **Coexistencia y tolerancia a versiones mixtas:**
  - Las columnas cuentan con valores por defecto o admiten nulos, permitiendo que instancias de backend previas operen simultáneamente durante despliegues sin interrupción.

---

## 6. Evidencia de Verificación

### Pruebas de Contratos y Frontera (`node --test`)
- [`tests/contracts/boundary.test.ts`](../tests/contracts/boundary.test.ts):
  - Verifica `requireBrowserMutation` aceptando `DELETE` con cabeceras requeridas y validando CSRF cuando hay sesión.
  - Valida `isSessionActive` cubriendo revocación explícita, caducidad por inactividad tras 60 minutos y caducidad absoluta a las 24 horas.
- [`tests/contracts/transports.test.ts`](../tests/contracts/transports.test.ts):
  - Verifica que `deleteOperation` envía el método `DELETE` con `X-CSRF-Token` y cabeceras de mutación.

### Pruebas Integradas de Seguridad (`Vitest`)
- [`tests/api/seguridad.test.ts`](../tests/api/seguridad.test.ts):
  - `S22-16 · cierre idempotente con DELETE, revocación en servidor y limpieza de cookie`: Pasa exitosamente.
  - `S22-17 · vencimientos absoluto e inactividad exactos con persistencia acotada y rechazo de replay`: Pasa exitosamente.
  - `S22-29 · migración aditiva y backfill de revocación e inactividad`: Pasa exitosamente.
  - Todas las 27 pruebas de la suite de seguridad pasan limpiamente.

### Contratos de API (`scripts/openapi.ts`)
- Especificación OpenAPI 3.2 ([`public/openapi.json`](../public/openapi.json)) sincronizada con el método `DELETE /api/demo/session` y respuesta `204 No Content`. `npm run api:check` verificado con éxito.
