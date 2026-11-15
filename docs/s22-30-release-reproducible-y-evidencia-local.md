# S22-30 · Cerrar la entrega local con regresión y evidencia reproducibles

**Fecha:** 2026-11-15  
**Estado:** COMPLETO Y VALIDADO LOCALMENTE  
**Trazabilidad:**
- **Spec S22:** [22-profesionalizacion-integral-y-confiabilidad.md](file:///C:/Users/Facundo/dev/jopoi/docs/specs/22-profesionalizacion-integral-y-confiabilidad.md)
- **Decisiones:** `D01`, `D04`, `D07`, `D19`, `D20`, `D21`
- **Hallazgos:** `AUD-01`, `AUD-02`, `AUD-03`, `AUD-04`, `AUD-05`, `AUD-06`, `AUD-07`, `AUD-08`, `AUD-09`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`, `AUD-16`, `AUD-17`
- **Historias:** 1, 2, 4, 21, 23, 29, 30, 31, 32, 33, 34, 35, 36, 38, 75, 76, 78, 81, 82, 83, 84, 85, 87, 88
- **Escenarios de Aceptación:** `S22-01` a `S22-32`
- **Marco de Ejecución:** Presupuesto cero, ADR vigentes, recursos locales aislados. Cierre local sin despliegue, sin provisión remota y sin envíos reales a Hedera HCS.

---

## 1. Resumen Ejecutivo

El Ticket 30 consolida el cierre integral de la fase de desarrollo y verificación local de la especificación **S22 (Profesionalización Integral y Confiabilidad)**. Produce una revisión candidata verificable que reúne todos los flujos del sistema y comunica con exactitud qué componentes han sido implementados y probados localmente, y cuáles requieren acreditación externa en el proveedor de nube durante los Tickets 31 y 32.

Todos los controles se sellan bajo la misma revisión Git y huella criptográfica SHA-256 (`fingerprint`) calculada a partir de los archivos fuente, esquemas, pruebas, scripts y configuraciones del repositorio.

---

## 2. Cumplimiento de Criterios de Aceptación

### Criterio 1: Gate Integral con la Misma Revisión y Fingerprint
El gate integral coordina y verifica la cadena completa de validación bajo un identificador unificado derivado de `evidenceRevision()`:
1. **Instalación reproducible:** Validación de `package-lock.json` versión 3 en sincronía estricta con `package.json`, motor Node.js v24 y overrides de seguridad.
2. **Prisma offline y aislado:** Generación (`prisma generate`) y validación (`prisma validate`) del esquema sin conexiones de red ni bases vivas.
3. **Tipado estricto completo:** Compilación estricta con TypeScript (`tsc --noEmit`, `tsconfig.strict.json` y `tsconfig.api.json`) con las opciones `strict: true`, `noUncheckedIndexedAccess: true` y `exactOptionalPropertyTypes: true` sin excepciones ni diagnósticos pendientes (0 errores).
4. **Linter unificado:** Biome lint (`biome lint . --error-on-warnings`) ejecutado sobre 260 archivos del repositorio con 0 errores y 0 advertencias.
5. **OpenAPI contrastado:** Especificación OpenAPI 3.2 validada contra el esquema JSON oficial de Ajv y sincronizada con `public/openapi.json`.
6. **Batería de pruebas automatizadas:**
   - Contratos HTTP y fronteras: 28 pruebas aprobadas (`tests/contracts/`).
   - Seguridad y dependencias: 7 pruebas aprobadas (`tests/security/`).
   - Dominio y persistencia: 54 pruebas aprobadas (`tests/domain/`).
   - Observabilidad integral: 61 pruebas aprobadas (`tests/observability/`), incluyendo diagnósticos correlacionados, métricas RED/USE, alertas multi-ventana, RUM privado, ensayo de capacidad de pool, ensayo de rollout/restauración y gate de release.
   - CLI y arneses operativos: 24 pruebas aprobadas (`tests/cli/`).
   - Tokens UI y presupuestos frontend: 12 pruebas aprobadas (`tests/ui/`).
   - API de integración: Pruebas Vitest de recorrido, autenticación y persistencia aprobadas.
7. **Compilación de producción:** `next build` con Turbopack exitoso, generando páginas estáticas, dinámicas y manifiestos de rutas.
8. **Laboratorio y presupuestos frontend:** Verificación de transferencias gzip (landing 184.09 KiB <= 200 KiB, demo 200.56 KiB <= 300 KiB, trazabilidad 128.54 KiB <= 250 KiB), módulo QR diferido (32.64 KiB), geometría reservada 256x256 px (CLS=0) y medianas Core Web Vitals en laboratorio (LCP 938 ms, CLS 0, TBT 235 ms).

### Criterio 2: Regresión Real Bloquea Release, PR No Confiable Protegido y Runner de Migración Separado
1. **Bloqueo automático ante regresión:** Cualquier discrepancia tipada, violación de linter, rotura de contrato OpenAPI, regresión de prueba unitaria/integración o exceso de presupuesto frontend interrumpe inmediatamente el pipeline con código de salida distinto de cero y etiqueta el estado como `BLOCKED`.
2. **Protección de pull requests no confiables:**
   - Los flujos de trabajo de GitHub Actions ([`.github/workflows/quality.yml`](file:///C:/Users/Facundo/dev/jopoi/.github/workflows/quality.yml) y [`.github/workflows/dependency-security.yml`](file:///C:/Users/Facundo/dev/jopoi/.github/workflows/dependency-security.yml)) declaran permisos mínimos de solo lectura (`permissions: contents: read`) y desactivan explícitamente el almacenamiento de credenciales (`persist-credentials: false`).
   - Los forks y PRs externos no reciben secretos de entorno ni acceso a variables de producción.
3. **Runner de migraciones estrictamente aislado:**
   - La ejecución de migraciones DDL requiere credenciales administrativas independientes (`DIRECT_URL`) con rol de esquema (`s17` / `neondb_owner`), separadas de la conexión habitual de la aplicación (`DATABASE_URL`) que opera bajo un rol restringido (`s21_app`) sin permisos de `CREATE TABLE` ni DDL.
   - El script de compilación en `package.json` es exclusivamente `prisma generate && next build`; `next build` nunca ejecuta `migrate deploy` ni toca bases de datos.
   - Las herramientas interactivas y destructivas (`db push` y `migrate dev`) están terminantemente prohibidas en entornos no locales.
   - Concurrencia controlada mediante PostgreSQL Session Advisory Lock (`2026111529`) que serializa ejecuciones y falla cerrado ante colisiones.

### Criterio 3: Matriz de 17 AUD y Seis Bloques DoD
La matriz enlaza de forma exhaustiva cada uno de los 17 hallazgos de auditoría (`AUD-01` a `AUD-17`) y los seis bloques obligatorios de Definition of Done (`JSTS`, `Rendering`, `API`, `Prisma`, `Seguridad`, `Observabilidad`).

Diferenciación estricta de estados:
- **`IMPLEMENTED`:** Código, esquemas y lógica completamente desarrollados.
- **`LOCAL_PROVEN`:** Validados exhaustivamente mediante suites de pruebas automatizadas y arneses de simulación local.
- **`EXTERNAL_PENDING`:** Requisitos que dependen de la infraestructura física del proveedor en la nube o de tráfico de campo real (e.g. validación de TLS verify-full contra Neon cloud, cron en Vercel, cohortes RUM reales de 28 días con >= 200 muestras).
- **`GLOBAL_ACCEPTANCE: false`:** Invariante crítico de S22. El Ticket 30 prohíbe formalmente declarar la aceptación global del sistema, reservando ese dictamen para los Tickets 31 y 32 tras la auditoría en la nube.

### Criterio 4: Preservación de los Tres Caminos del Recorrido y Adaptadores de Compatibilidad
1. **Tres caminos del producto plenamente preservados:**
   - **Camino 1 · Landing y Admisión (`/`):** Presentación, formulario de solicitud protegido con límite diario (100/día), inicio de sesión con cookie HTTP y presupuesto de 184.09 KiB.
   - **Camino 2 · Panel Operativo (`/demo`):** Gestión del lote único y recorrido, edición con precondición `If-Match` (412 / 428), idempotencia contra reintentos duplicados (`Idempotency-Key` / 409) y despacho coordinado hacia HCS con lease de concurrencia.
   - **Camino 3 · Trazabilidad Pública (`/trazabilidad/:traceId` y `/api/v1/traces/:traceId`):** Renderizado SSR útil sin JavaScript, respuestas reales antes del shell (404/410/503), código QR con geometría 256x256 px fija (CLS=0) y validación de hitos contra Hedera Mirror Node.
2. **Adaptadores de compatibilidad HTTP:**
   - Endpoints `/api/traces/:traceId` y `/api/traces/:traceId/events/:eventId/verification` continúan respondiendo a clientes existentes.
   - Emiten cabeceras estándar `Deprecation: true` y `Link: </api/v1/...>; rel="successor-version"`.
   - Se omite de forma explícita el encabezado `Sunset`, garantizando que ningún adaptador sea retirado antes del plazo y la evidencia requeridos.

### Criterio 5: Procedimiento y Validador de Candidato Externo
1. **Validador CLI (`scripts/release-gate.ts --candidate-check`):**
   - Incorpora la función `validateCandidateRequirements()` que audita el entorno para el Ticket 31.
   - Rechazo explícito con códigos deterministas cuando faltan evidencias:
     - `CANDIDATE_URL_MISSING_OR_LOCAL`: Si `APP_URL` no está definida o apunta a `localhost`/`127.0.0.1`.
     - `NEON_TLS_VERIFY_FULL_UNVERIFIED`: Si `DATABASE_URL` no exige `sslmode=verify-full` contra `.neon.tech`.
     - `HEDERA_TESTNET_TOPIC_UNCONFIGURED`: Si falta `HEDERA_TOPIC_ID` en formato Hedera (`0.0.x`).
     - `FIELD_RUM_SAMPLES_INSUFFICIENT`: Si las muestras reales de telemetría de campo son menores a 200 por cohorte.
     - `OPERATIONAL_ALERT_CHANNEL_UNCONFIGURED`: Si no se ha configurado un canal/webhook para el runbook de guardia.
2. **Prohibición de aprobación por omisión:** Si cualquiera de estas condiciones externas falta, el validador emite `REJECTED_MISSING_EVIDENCE` y sale con código 1.
3. **Respeto a la política de presupuesto cero:** Durante la ejecución del Ticket 30 no se efectuó ningún despliegue en Vercel, no se aprovisionaron bases en Neon ni se remitieron mensajes pagados a Hedera Hashgraph.

---

## 3. Matriz de Trazabilidad Integral (AUD-01 a AUD-17)

| Hallazgo | Decisiones | Casos S22 | Impl. | Local | Nube Pend. | Estado | Evidencia de Validación |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **AUD-01** · Admisión incompleta | D02, D15, D17 | S22-01–04, 24, 28 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `tests/api/seguridad.test.ts`, `tests/observability/capacity.test.ts` |
| **AUD-02** · Capacidad de limpieza | D02, D03, D14, D16 | S22-05–06, 27 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `scripts/maintenance.ts`, `tests/observability/alerts.test.ts` |
| **AUD-03** · Dependencia ws | D04, D19 | S22-07, 31 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `tests/security/dependencies.test.mjs`, `package.json` (ws@8.21.0) |
| **AUD-04** · Diagnóstico seguro | D05, D13 | S22-08–09 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `src/server/diagnostics.ts`, `tests/observability/diagnostics.test.ts` |
| **AUD-05** · Perfil TypeScript | D06, D19 | S22-10–11 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `tsconfig.strict.json`, `tests/quality/gate.test.mjs` (0 errores) |
| **AUD-06** · CSP y cabeceras | D09, D11, D12 | S22-15, 19, 21 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `src/server/http.ts`, `tests/contracts/boundary.test.ts` |
| **AUD-07** · Contrato HTTP | D07, D08 | S22-12–14 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `tests/contracts/openapi.test.ts`, `tests/api/problem-details.test.ts` |
| **AUD-08** · Gate integral | D19, D20 | S22-10, 31 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `scripts/quality.ts`, `.github/workflows/quality.yml` |
| **AUD-09** · Operación medible | D05, D13, D14 | S22-08–09, 26–27, 32 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `tests/observability/metrics.test.ts`, `tests/observability/alerts.test.ts` |
| **AUD-10** · Render y frescura | D08, D09, D11 | S22-19–21 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `src/app/trazabilidad/`, `tests/ui/frontend-budgets.test.ts` |
| **AUD-11** · CWV y budgets | D02, D12, D13 | S22-22–23 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `scripts/frontend-gate.ts`, `tests/observability/rum.test.ts` |
| **AUD-12** · Pool global | D14, D17 | S22-28 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `scripts/capacity-benchmark.ts`, `tests/observability/capacity.test.ts` |
| **AUD-13** · Sesión y CSRF | D10 | S22-16–18 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `src/server/session.ts`, `tests/api/seguridad.test.ts` |
| **AUD-14** · Estados inválidos | D06, D16, D18 | S22-11, 29 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `src/domain/operations.ts`, `scripts/rollout-restore.ts` |
| **AUD-15** · Proyecciones | D16, D17 | S22-28 | SÍ | SÍ | NO | `LOCAL_PROVEN` | `src/server/operations.ts`, `scripts/export-contacts.ts` |
| **AUD-16** · Claridad documental | D06, D19 | S22-10, 31 | SÍ | SÍ | NO | `LOCAL_PROVEN` | Documentación técnica en español rioplatense, linting Biome |
| **AUD-17** · Resiliencia HCS | D03, D14, D15 | S22-24–25, 27 | SÍ | SÍ | SÍ | `LOCAL_PROVEN` | `scripts/rollout-restore.ts`, `tests/observability/rollout-restore.test.ts` |

---

## 4. Matriz de Cumplimiento de Definition of Done (DoD)

| Bloque | Criterio Obligatorio | Comprobado Local | Pendiente de Campo | Estado |
| :--- | :--- | :---: | :---: | :---: |
| **JSTS** | Cero errores con 3 flags estrictos, cero any no justificados, estados semánticos validados, causas de error preservadas y lint completo. | SÍ | NO | `LOCAL_PROVEN` |
| **Rendering** | Budgets gzip cumplidos, historial SSR sin JS, status reales antes del shell, CLS=0 con espacio QR reservado, RUM privado sin PII. | SÍ | SÍ (>= 200 muestras de visitantes) | `LOCAL_PROVEN` |
| **API** | OpenAPI 3.2 validado, Problem Details RFC 9457, ETag fuerte, If-Match 412/428, Idempotency-Key 409/400 y rate limiting atómico. | SÍ | NO | `LOCAL_PROVEN` |
| **Prisma** | Pool 2 conn/instancia, modelo 20 clientes global, select explícito, constraints de integridad SQL, migraciones aditivas y restore aislado 100% paritario. | SÍ | SÍ (pgBouncer y TLS en Neon cloud) | `LOCAL_PROVEN` |
| **Seguridad** | Avisos de ws mitigados (8.21.0), cookie `__Host-`, tokens CSRF vinculados, CSP estricta sin unsafe-inline y exclusión total de PII en telemetría. | SÍ | SÍ (HSTS en HTTPS de producción) | `LOCAL_PROVEN` |
| **Observabilidad** | Digest público de correlación, W3C traceparent, logs JSON a stderr, métricas RED/USE acotadas, sondas live/ready diferenciadas y alertas con runbooks. | SÍ | SÍ (Canal de notificación de alertas) | `LOCAL_PROVEN` |

---

## 5. Artefactos de Salida Generados

1. **[`scripts/lib/release-gate-model.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/lib/release-gate-model.ts):** Modelo central de datos, evaluador de matriz AUD/DoD, comprobación de seguridad en CI y validador de candidato externo.
2. **[`scripts/release-gate.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/release-gate.ts):** Herramienta CLI con modos `--run`, `--evaluate-only` y `--candidate-check`.
3. **[`tests/observability/release-gate.test.ts`](file:///C:/Users/Facundo/dev/jopoi/tests/observability/release-gate.test.ts):** Suite de 11 pruebas automatizadas integradas en `npm run test:observability`.
4. **[`.cache/s22-release/candidate-release-report.json`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-release/candidate-release-report.json):** Reporte estructurado legible por máquina con la revisión y fingerprint exactos.
5. **[`.cache/s22-release/release-evidence-matrix.md`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-release/release-evidence-matrix.md):** Matriz documental consolidada en Markdown.

---

## 6. Procedimiento para el Ticket 31

El Ticket 31 ([`31-aceptacion-operativa-candidato.md`](file:///C:/Users/Facundo/dev/jopoi/.scratch/s22-profesionalizacion-integral/drafts/31-aceptacion-operativa-candidato.md)) requerirá:
1. Proveer archivo `.env` o credenciales con:
   - `APP_URL`: Dominio HTTPS en Vercel Preview/Producción.
   - `DATABASE_URL`: Connection string hacia el pooler de Neon con `sslmode=verify-full`.
   - `DIRECT_URL`: Connection string directa a Neon para migraciones con rol administrativo y `sslmode=verify-full`.
   - `HEDERA_TOPIC_ID` y `HEDERA_OPERATOR_ID`: Credenciales activas en Hedera Testnet.
   - `ALERT_NOTIFICATION_WEBHOOK`: Endpoint autorizado para pruebas de alertas.
2. Ejecutar la validación con:
   ```bash
   npm run release:gate -- --candidate-check --env-file <archivo.env>
   ```
3. Toda evidencia ausente mantendrá el bloqueo operativo, impidiendo la aceptación por omisión.
