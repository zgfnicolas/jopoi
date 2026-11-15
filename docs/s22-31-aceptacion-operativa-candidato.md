# S22-31 · Acreditar seguridad, capacidad y recuperación del candidato

**Fecha:** 2026-11-15  
**Estado:** EVALUACIÓN CONCLUIDA CON BLOQUEOS EXTERNOS REGISTRADOS (`BLOQUEADO_CONDICION_EXTERNA`)  
**Trazabilidad:**
- **Spec S22:** [22-profesionalizacion-integral-y-confiabilidad.md](file:///C:/Users/Facundo/dev/jopoi/docs/specs/22-profesionalizacion-integral-y-confiabilidad.md)
- **Decisiones:** `D01`, `D09`, `D10`, `D13`, `D14`, `D17`, `D18`, `D21`
- **Hallazgos:** `AUD-01`, `AUD-02`, `AUD-03`, `AUD-04`, `AUD-06`, `AUD-07`, `AUD-08`, `AUD-09`, `AUD-10`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`, `AUD-17`
- **Historias:** 1, 2, 15, 16, 20, 24, 25, 27, 38, 42, 43, 44, 45, 46, 47, 48, 50, 52, 60, 61, 62, 64, 66, 67, 69, 70, 71, 72, 76, 78, 79, 80, 82, 83, 84, 85, 86, 88
- **Escenarios:** `S22-01`, `S22-05`, `S22-06`, `S22-08`, `S22-09`, `S22-12`, `S22-14`, `S22-15`, `S22-16`, `S22-17`, `S22-18`, `S22-19`, `S22-24`, `S22-25`, `S22-26`, `S22-27`, `S22-28`, `S22-29`, `S22-30`, `S22-32`
- **Marco de Ejecución:** Presupuesto cero estricto, ADR vigentes, recursos locales aislados. Cierre local sin gastos, sin aprovisionamiento remoto no autorizado, sin despliegues ficticios y sin envíos de red pagados.

---

## 1. Resumen Ejecutivo y Mandato Arquitectónico

El Ticket 31 evalúa la acreditación operativa de la aplicación en el entorno gratuito seleccionado (**Vercel Hobby** y **Neon Serverless Postgres Free** vía marketplace), contrastando que los controles demostrados localmente se preserven efectivamente en la infraestructura del hosting y de los proveedores.

Conforme a la especificación S22 y a las decisiones arquitectónicas vigentes:
1. **Condición Externa Explícita:** Requiere candidato explícito (`APP_URL` HTTPS), acceso al proveedor de nube, canal de alertas de guardia configurado y autorización operativa expresa para despliegue, restauración aislada y mensajes testnet.
2. **Presupuesto Cero y Sin Gastos:** Prohíbe terminantemente agregar medios de pago, autorizar upgrades automáticos a planes Pro/Scale o contratar add-ons comerciales.
3. **Prohibición de Aprobación por Omisión:** Ante la falta de acceso a la infraestructura remota o de autorizaciones operativas en esta sesión local, el arnés de verificación **registra determinísticamente todos los bloqueos externos** y declara el ticket en estado `BLOQUEADO_CONDICION_EXTERNA` con código de salida `1`, impidiendo simular aprobaciones ficticias o dar por cerrado el ticket sin evidencia real.
4. **Invariante de Aceptación Global:** `globalAcceptance: false` se mantiene inviolable, quedando reservada para el dictamen final del Ticket 32 tras la validación de campo.

---

## 2. Evaluación de los Seis Criterios de Aceptación

### Criterio 1: Plan gratuito, integración nativa, región/localidad, límites de pooler, TLS y grants mínimos
- **Especificación:**
  - Vercel: Plan Hobby sin tarjeta de crédito ni auto-upgrade (`noPaymentMethod: true`, `noAutomaticUpgrade: true`).
  - Neon: Plan Free aprovisionado como integración nativa en Vercel Marketplace, con credenciales sincronizadas automáticamente.
  - Co-ubicación: Funciones en `iad1` (Washington D.C.) y base de datos en AWS `us-east-1` (latencia intra-región < 1.5 ms).
  - Pooler: pgBouncer en modo transacción (`-pooler.us-east-1.aws.neon.tech`), límite de `max: 2` conexiones por instancia y modelo global de 20 conexiones.
  - Seguridad de red: `sslmode=verify-full` con validación estricta de nombres y cadena de certificación X.509.
  - Privilegios: Conexión de aplicación `DATABASE_URL` restringida al rol DML `s21_app` (sin `CREATE TABLE`), separada de `DIRECT_URL` para migraciones administrativas DDL.
- **Estado Actual:** `BLOQUEADO_CONDICION_EXTERNA` (`BLOCK_CRIT_1_PROVIDER_INFRASTRUCTURE`).
- **Bloqueo Registrado:** No se cuenta con acceso al dashboard de Vercel/Neon ni archivo de prueba v2 firmado en esta sesión local.
- **Acción para Desbloqueo:** Suministrar archivo de prueba firmado `provider-proof.json` extraído del dashboard del proyecto Vercel vinculado o credenciales de candidato explícito.

### Criterio 2: HTTP/navegador del candidato, CSP, cookies, telemetría y alertas sin secretos
- **Especificación:**
  - Dominio HTTPS público con cabeceras efectivas: CSP estricta (sin `unsafe-inline` general), HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
  - Cookie de sesión `__Host-` con atributos `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
  - Token CSRF vinculado y validación de Fetch Metadata (`Sec-Fetch-Site`, `Sec-Fetch-Mode`).
  - Caché seguro: `private, no-store` en representaciones privadas y de cuota.
  - Respuestas HTTP reales antes del shell (404 no encontrado, 410 vencido tras 7 días).
  - Telemetría y logs estructurados a stderr sin PII, tokens ni credenciales.
  - Señal real de alertas probada hacia el canal de guardia documentado en `docs/runbooks/`.
- **Estado Actual:** `BLOQUEADO_CONDICION_EXTERNA` (`BLOCK_CRIT_2_LIVE_HTTPS_AND_ALERTS`).
- **Bloqueo Registrado:** La variable `APP_URL` apunta a entorno local y falta canal de alertas (`ALERT_NOTIFICATION_WEBHOOK`).
- **Acción para Desbloqueo:** Desplegar candidato en Vercel Preview y configurar endpoint de webhook autorizado para alertas de guardia.

### Criterio 3: Carga aprobada vs modelo global y observabilidad del cron en el entorno
- **Especificación:**
  - Contraste del benchmark de capacidad (S22-28) contra los límites efectivos en el hosting:
    - Concurrencia 8 clientes sin errores HTTP 500.
    - Latencia hot-path: p95 <= 750 ms, p99 <= 1500 ms.
    - Conexiones activas por instancia: exactamente <= 2.
  - Cron diario de Vercel (`vercel.json`: `0 3 * * *` hacia `/api/cron`):
    - No basta una respuesta HTTP 200 aislada; se exige evidencia de ejecución física: `lastCompletedAt` dentro de las últimas 24 h y retención de registros vencidos con atraso máximo < 36 h.
- **Estado Actual:** `BLOQUEADO_CONDICION_EXTERNA` (`BLOCK_CRIT_3_CRON_AND_LIVE_LOAD`).
- **Bloqueo Registrado:** No se cuenta con historial de invocaciones de cron de Vercel ni métricas de retención física en producción.
- **Acción para Desbloqueo:** Capturar y adjuntar log de ejecución del cron diario desde los logs de Vercel.

### Criterio 4: Backups y restauración del proveedor en la oferta real gratuita
- **Especificación:**
  - Neon Serverless Postgres Free: Snapshots automáticos y point-in-time recovery (PITR) limitados al plan gratuito (o branching efímero).
  - RPO / RTO realistas documentados:
    - RPO: <= 24 horas (derivado del ciclo de snapshots gratuitos diarios).
    - RTO: <= 30 minutos (tiempo de restauración de branch y reconexión).
  - Restricción presupuestaria: Prohibición absoluta de contratar planes pagos para obtener PITR continuo o menor RTO. Las carencias del plan gratuito se documentan como límites del entorno.
  - Ensayo de restauración aislada verificado sin alterar datos ni romper producción.
- **Estado Actual:** `BLOQUEADO_CONDICION_EXTERNA` (`BLOCK_CRIT_4_PROVIDER_BACKUP_RESTORE`).
- **Bloqueo Registrado:** Ensayo de restauración sobre branch efímero de Neon pendiente de ejecución en la infraestructura remota.
- **Acción para Desbloqueo:** Ejecutar y registrar ensayo de restauración sobre branch efímero sin costo en Neon.

### Criterio 5: Recorrido real en testnet con evidencia de red y misma identidad
- **Especificación:**
  - Cinco hitos reales ordenados en Hedera Testnet:
    1. `LOT_PUBLISHED`
    2. `LOT_APPROVED`
    3. `TRANSPORT_ASSIGNED`
    4. `PICKUP_CONFIRMED`
    5. `RECEIPT_ACCEPTED`
  - Publicación sobre el tópico asignado (`HEDERA_TOPIC_ID`) mediante cuenta operadora (`HEDERA_OPERATOR_ID`).
  - Verificación en Hedera Mirror Node de sequence numbers, timestamps de consenso y hashes SHA-256 inmutables.
  - Misma identidad (`traceId`) unificada a lo largo de todo el ciclo.
  - Invariante estricto: Mocks o datos sintéticos locales NO sustituyen la prueba real en la red descentralizada.
- **Estado Actual:** `BLOQUEADO_CONDICION_EXTERNA` (`BLOCK_CRIT_5_TESTNET_LIVE_JOURNEY`).
- **Bloqueo Registrado:** Falta autorización operativa expresa y journal de transacciones reales en Hedera Testnet.
- **Acción para Desbloqueo:** Autorizar ejecución del journal live contra Hedera Testnet y suministrar credenciales de operador de pruebas (costo cero, fondos de grifo).

### Criterio 6: Vinculación criptográfica de artefactos y registro determinista de bloqueos
- **Especificación:**
  - Todos los artefactos generados se sellan con la revisión Git HEAD, el dirty status y el fingerprint SHA-256.
  - Toda condición faltante se registra de forma exhaustiva, impidiendo marcar el ticket como aprobado por omisión.
- **Estado Actual:** **`APROBADO`**.
- **Evidencia:**
  - El arnés [`scripts/candidate-acceptance.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/candidate-acceptance.ts) ejecuta la evaluación determinista, calcula el fingerprint criptográfico, documenta los 5 bloqueos externos y emite código de salida `1` para bloquear el pipeline de forma segura.

---

## 3. Matriz de Bloqueos Externos Registrados

| Código de Bloqueo | Título del Bloqueo | Recurso Requerido | Restricción Presupuesto Cero | Acción de Desbloqueo |
| :--- | :--- | :--- | :--- | :--- |
| `BLOCK_CRIT_1_PROVIDER_INFRASTRUCTURE` | Infraestructura de nube no accesible | Acceso a Vercel Hobby y Neon Free | Prohibido agregar tarjeta o autorizar upgrades | Adjuntar `provider-proof.json` firmado |
| `BLOCK_CRIT_2_LIVE_HTTPS_AND_ALERTS` | Candidato HTTPS y alertas no configurados | `APP_URL` HTTPS pública y canal de alertas | Uso de webhooks/correos gratuitos | Desplegar preview y configurar webhook |
| `BLOCK_CRIT_3_CRON_AND_LIVE_LOAD` | Cron de Vercel y métricas no acreditados | Invocación de cron `0 3 * * *` en Vercel | Invocaciones dentro del cupo gratuito de Vercel | Capturar logs de ejecución de cron |
| `BLOCK_CRIT_4_PROVIDER_BACKUP_RESTORE` | Restauración aislada de Neon pendiente | Ensayo de branching/snapshot en Neon | Prohibido contratar planes Scale | Ejecutar restore en branch efímero |
| `BLOCK_CRIT_5_TESTNET_LIVE_JOURNEY` | Recorrido real en Hedera Testnet pendiente | 5 transacciones firmadas en tópico | Cuenta de prueba con fondos de grifo (cero costo) | Autorizar corrida de journal live |

---

## 4. Artefactos de Implementación y Verificación

1. **[`scripts/lib/candidate-acceptance-model.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/lib/candidate-acceptance-model.ts):**
   - Esquemas Zod estrictos para `CandidateProviderProof` v2 y `TestnetLiveJournal`.
   - Motor `evaluateCandidateAccreditation()` que inspecciona el entorno, valida pruebas adjuntas y registra determinísticamente bloqueos externos.
2. **[`scripts/candidate-acceptance.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/candidate-acceptance.ts):**
   - CLI ejecutable con soporte para `--run`, `--proof`, `--journal`, `--evaluate-only` y `--json`.
3. **[`tests/observability/candidate-acceptance.test.ts`](file:///C:/Users/Facundo/dev/jopoi/tests/observability/candidate-acceptance.test.ts):**
   - Suite de 7 pruebas unitarias y de integración que verifican el rechazo determinista ante falta de acceso, aprobación con pruebas válidas, rechazo de datos sintéticos en testnet, prohibición de planes pagos y ejecución del CLI.
4. **[`.cache/s22-candidate/candidate-acceptance-report.json`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-candidate/candidate-acceptance-report.json):**
   - Reporte JSON estructurado con el estado actual `BLOQUEADO_CONDICION_EXTERNA` y la lista de bloqueos.
5. **[`.cache/s22-candidate/candidate-acceptance-report.md`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-candidate/candidate-acceptance-report.md):**
   - Reporte en formato Markdown generado por el CLI.

---

## 5. Instrucciones para Ejecución con Evidencia Externa

Cuando se disponga de acceso a los servicios de nube y autorización operativa, la validación se completará ejecutando:

```bash
# 1. Configurar variables de entorno del candidato en archivo .env
APP_URL="https://jopoi-candidate.vercel.app"
HEDERA_TOPIC_ID="0.0.xxxxxx"
HEDERA_OPERATOR_ID="0.0.xxxxxx"
ALERT_NOTIFICATION_WEBHOOK="https://alerts.example.com/webhook"

# 2. Ejecutar la acreditación pasando las pruebas recolectadas
npm run candidate:check -- --proof .cache/s22-candidate/provider-proof.json --journal .cache/s22-candidate/live-journal.json
```
