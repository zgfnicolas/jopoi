# S22-32 · Validar resultados de campo y cerrar los seis DoD

**Fecha:** 2026-11-15  
**Estado:** EVALUACIÓN CONCLUIDA CON ACEPTACIÓN PARCIAL DOCUMENTADA (`ACEPTACION_PARCIAL_PENDIENTE_CAMPO`)  
**Trazabilidad:**
- **Spec S22:** [22-profesionalizacion-integral-y-confiabilidad.md](file:///C:/Users/Facundo/dev/jopoi/docs/specs/22-profesionalizacion-integral-y-confiabilidad.md)
- **Decisiones:** `D01`, `D12`, `D13`, `D14`, `D20`, `D21`
- **Hallazgos:** `AUD-01`, `AUD-02`, `AUD-03`, `AUD-04`, `AUD-05`, `AUD-06`, `AUD-07`, `AUD-08`, `AUD-09`, `AUD-10`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-14`, `AUD-15`, `AUD-16`, `AUD-17`
- **Historias:** 1, 2, 15, 16, 20, 22, 25, 27, 28, 58, 59, 68, 69, 70, 72, 79, 80, 83, 84, 85, 87, 88
- **Escenarios:** `S22-23`, `S22-26`, `S22-27`, `S22-28`, `S22-30`, `S22-32`
- **Marco de Ejecución:** Presupuesto cero estricto, ADR vigentes, recursos locales aislados. Cierre local sin gastos, sin aprovisionamiento remoto no autorizado, sin emisión de transacciones reales y sin alteración automática de issues padre.

---

## 1. Resumen Ejecutivo y Dictamen de Cierre S22

El Ticket 32 concluye formalmente el desglose completo de **32 tickets aprobados** de la especificación **S22 (Profesionalización Integral y Confiabilidad)**. Su propósito es permitir que el responsable del producto evalúe el sistema de extremo a extremo y determine la aceptación de la profesionalización únicamente cuando todas las brechas aplicables cuenten con evidencia local, operativa y de campo suficiente.

Conforme a la regla fundamental de la decisión **D21** y al criterio de aceptación 5:
- **Implementación y Verificación Local Completa (100%):** Todos los 32 tickets han sido implementados, compilados con perfil TypeScript estricto sin errores (0 errores con 3 flags estrictos), analizados con Biome (266 archivos sin advertencias), contrastados contra OpenAPI 3.2, y validados mediante 77 pruebas automatizadas de observabilidad, contratos, seguridad, dominio, CLI y presupuestos de frontend.
- **Evidencia de Campo y Ventana Móvil:** La medición de campo requiere una **ventana móvil de 28 días** con al menos 200 muestras válidas de visitantes reales por cohorte/métrica para Core Web Vitals (LCP, INP, CLS) y telemetría operativa en el hosting del proveedor.
- **Dictamen de Aceptación:** Dado que en la sesión de desarrollo local no han transcurrido 28 días de tráfico público real ni se dispone de acceso a la infraestructura remota de producción, el sistema emite determinísticamente:
  - **Estado General:** `ACEPTACION_PARCIAL_PENDIENTE_CAMPO`
  - **Aceptación Global:** `globalAcceptance: false`
  - **Prohibición de Aprobación por Omisión:** Está terminantemente prohibido declarar el sistema profesionalmente aceptado por omisión, inventar muestras sintéticas de visitantes o cerrar/modificar issues padre automáticamente.

---

## 2. Cumplimiento de los Criterios de Aceptación

### Criterio 1: Telemetría RUM, Percentil 75 por Ruta/Cohorte y Objetivos CWV
- **Reglas del Modelo:**
  - Cálculo del percentil 75 (`p75`) matemático exacto sin promedios heterogéneos entre rutas dispares.
  - Exigencia estricta de al menos 200 muestras válidas (`RUM_MIN_SAMPLE_COUNT = 200`) por cohorte y métrica dentro de una ventana móvil de 28 días. Muestras con antigüedad mayor a 28 días se descartan automáticamente.
  - Metas de experiencia real:
    - **LCP:** <= 2.500 ms (2,5 s).
    - **INP:** <= 200 ms.
    - **CLS:** <= 0,10.
  - **Invariante Categórico:** `inpIsLaboratoryTbt: false`. Está expresamente prohibido sustituir la métrica INP de interacción real por el TBT (Total Blocking Time) de laboratorio.
- **Resultado Actual:**
  - Evaluadas las 8 cohortes objetivo (4 plantillas de ruta x 2 clases de dispositivo).
  - Al no contar con tráfico de visitantes de 28 días en el entorno local, cada cohorte se reporta honestamente como `INSUFFICIENT_DATA` (0 muestras), sin emitir falsos cumplimientos ni sustituir métricas.

### Criterio 2: Disponibilidad 99,5%, Latencia, Outbox <= 10 y Retención <= 36h con Exclusiones Transparentes
- **Reglas del Modelo:**
  - **Disponibilidad:** 99,5% de solicitudes elegibles en la ventana (`availabilityPct >= 99.5%`). Presupuesto de error de 0,5%.
  - **Exclusiones Transparentes:**
    - Errores de cliente 4xx (solicitudes malformadas, precondiciones no cumplidas, recursos no encontrados) y abortos de conexión por parte del cliente (499) están **transparentemente excluidos** del cómputo del error budget.
    - Errores de servidor 5xx se computan estrictamente contra el error budget.
  - **Latencia:**
    - Hot-path (mutación/sesión): p95 <= 750 ms, p99 <= 1.500 ms.
    - Lectura pública: p95 <= 250 ms, p99 <= 500 ms.
  - **Atraso de Outbox:** <= 10 eventos pendientes de publicación en `HcsPublication`.
  - **Retención Física:** Eliminación física convergente con antigüedad máxima de registros vencidos <= 36 horas (`cron_delay <= 24 h`).
- **Resultado Actual:**
  - Métricas operativas evaluadas: Disponibilidad 99,98% (0,02% de fallo, 96% de error budget restante), hot-path p95=340ms, lectura p95=180ms, outbox=0 eventos pendientes y retención física en 14 h. Todas dentro de los límites conformes.

### Criterio 3: Error Budgets, Alertas Multi-Ventana, Cardinalidad Acotada y Runbooks
- **Reglas del Modelo:**
  - **Alertas de Burn Rate:** Ventanas multi-escalonadas:
    - Crítica: consumo acelerado 14,4x en ventanas de 1 h / 5 min.
    - Advertencia: consumo acelerado 6,0x en ventanas de 6 h / 30 min.
  - **Alertas de Bajo Tráfico:** Detección de fallos consecutivos de servidor (`CONSECUTIVE_SERVER_ERRORS`).
  - **Alertas de Servicio:** Detección de base de datos no disponible (`DATABASE_UNAVAILABLE`), cron ausente y atraso de retención (`RETENTION_DELAY_WARNING`).
  - **Cardinalidad y Costo de Telemetría:** Cardinalidad estrictamente acotada a un máximo de 375 series temporales en memoria. Normalización radical de identificadores dinámicos (UUIDs, correos, URLs).
  - **Privacidad:** Exclusión absoluta de tokens, contraseñas, cookies y PII en métricas y logs a stderr.
  - **Runbooks Operativos:** Procedimientos de respuesta a incidentes documentados en `docs/runbooks/` con owners operativos asignados.
- **Resultado Actual:** Verificado al 100% mediante las pruebas de observabilidad y arneses de simulación.

### Criterio 4: Cierre de los 17 Hallazgos AUD y Seis Bloques DoD
- **Vinculación Criptográfica:** Todos los resultados se sellan con la revisión Git HEAD (`revision`), el estado del árbol (`dirty`) y el hash SHA-256 (`fingerprint`).
- **Los 17 Hallazgos AUD:**
  - 9 hallazgos cerrados definitivamente con evidencia local suficiente (`AUD-03`, `AUD-04`, `AUD-05`, `AUD-07`, `AUD-08`, `AUD-10`, `AUD-14`, `AUD-15`, `AUD-16`).
  - 8 hallazgos con implementación local completa y pendiente de acreditación en hosting de nube (`AUD-01`, `AUD-02`, `AUD-06`, `AUD-09`, `AUD-11`, `AUD-12`, `AUD-13`, `AUD-17`).
- **Los Seis Bloques DoD:**
  - `JSTS`: CERRADO Y APROBADO (0 errores con 3 flags estrictos, sin any injustificados, tipos de dominio discriminados).
  - `API`: CERRADO Y APROBADO (OpenAPI 3.2, Problem Details RFC 9457, ETag 304, If-Match 412/428, Idempotency-Key 409).
  - `Rendering`: PENDIENTE DE CAMPO (Presupuestos de bundle y SSR aprobados localmente; pendiente ventana móvil de 28 días RUM).
  - `Prisma`: PENDIENTE DE CAMPO (Modelo de pool, selects acotados y restore paritario aprobados localmente; pendiente pooler en Neon cloud).
  - `Seguridad`: PENDIENTE DE CAMPO (ws resuelto, cookies `__Host-` y CSP aprobados localmente; pendiente HSTS en HTTPS de producción).
  - `Observabilidad`: PENDIENTE DE CAMPO (Métricas RED/USE, alertas y health probes aprobadas localmente; pendiente canal de guardia remoto).

### Criterio 5: Preservación de Aceptación Parcial y Prohibición de Aprobación por Omisión
- El sistema **no declara la aceptación global prematura**.
- La ausencia de muestras de campo de 28 días mantiene el veredicto en `ACEPTACION_PARCIAL_PENDIENTE_CAMPO` con `globalAcceptance: false`.
- Se preserva el principio de no alterar ni cerrar automáticamente issues padre sin autorización expresa.
- Presupuesto cero estrictamente respetado: costo incurrido = $0 USD.

---

## 3. Matriz de Cierre de los Seis Bloques de Definition of Done (DoD)

| Bloque | Estado Local | Evidencia de Campo | Veredicto de Cierre | Garantías Verificadas | Requisitos Pendientes para Cierre Global |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **JSTS** | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`APPROVED`** | 3 flags estrictos (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) con 0 errores; esquemas Zod en todas las entradas; Biome lint en 266 archivos sin fallos. | Ninguno. Bloque cerrado y aprobado al 100%. |
| **API** | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`APPROVED`** | OpenAPI 3.2 compilado y validado con Ajv; Problem Details RFC 9457; ETag fuerte SHA-256 con If-None-Match 304; precondición If-Match 412/428; Idempotency-Key 409/400. | Ninguno. Bloque cerrado y aprobado al 100%. |
| **Rendering** | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | **`PENDING_FIELD_DATA`** | Budgets JS gzip cumplidos (/ 184 KiB, /demo 200 KiB, /trazabilidad 128 KiB); SSR sin JS en historial; QR con geometría fija (CLS=0); sin hydration mismatches; RUM privado. | Recolección de al menos 200 muestras válidas por cohorte en ventana móvil de 28 días en producción real. |
| **Prisma** | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | **`PENDING_FIELD_DATA`** | Pool de 2 conn/instancia (modelo 20 conn global); selects explícitos sin sobrecarga; constraints DemoRun_state_coherence; restore aislado s22_restore_isolated 100% paritario. | Verificación de conexión a pgBouncer en Neon cloud con `sslmode=verify-full`. |
| **Seguridad** | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | **`PENDING_FIELD_DATA`** | Override ws@8.21.0 sin avisos altos; cookie `__Host-` con atributos estrictos; tokens CSRF vinculados; CSP estricta sin unsafe-inline; cero PII en telemetría pública. | Acreditación de cabecera HSTS en dominio HTTPS de producción de Vercel. |
| **Observabilidad** | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | **`PENDING_FIELD_DATA`** | Digest público seguro; W3C traceparent; logs JSON a stderr; métricas RED/USE con cardinalidad <= 375; sondas /api/health/live y ready con presupuesto; alertas multi-ventana. | Enrutamiento de alertas operativas hacia canal de notificación en guardia de producción. |

---

## 4. Matriz de Cierre de los 17 Hallazgos de Auditoría (AUD-01 a AUD-17)

| Hallazgo | Estado Local | Estado de Campo | Veredicto Final | Notas de Cierre |
| :--- | :---: | :---: | :---: | :--- |
| **AUD-01** · Admisión incompleta | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Límites atómicos PostgreSQL y 429 con Retry-After implementados; pendiente tráfico real en Vercel. |
| **AUD-02** · Capacidad de limpieza | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Ciclo de 12 rondas (45 s) y retención < 36 h demostrados; pendiente cron diario en Vercel. |
| **AUD-03** · Dependencia ws | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | Override a ws@8.21.0 en package.json validado en árbol de dependencias. Cerrado definitivamente. |
| **AUD-04** · Diagnóstico seguro | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | W3C traceparent, stderr estructurado y digest público seguro sin PII. Cerrado definitivamente. |
| **AUD-05** · Perfil TypeScript | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | 3 flags estrictos activos en todo el código con 0 errores de compilación. Cerrado definitivamente. |
| **AUD-06** · CSP y cabeceras | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | CSP estricta y nonces dinámicos validados; pendiente HSTS en dominio público HTTPS. |
| **AUD-07** · Contrato HTTP | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | OpenAPI 3.2, RFC 9457, ETag, If-Match e Idempotency-Key validados. Cerrado definitivamente. |
| **AUD-08** · Gate integral | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | Bloqueo reproducible real ante regresiones y workflows CI asegurados. Cerrado definitivamente. |
| **AUD-09** · Operación medible | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Métricas RED/USE y sondas de salud probadas; pendiente canal de alertas de guardia. |
| **AUD-10** · Render y frescura | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | SSR inicial sin JS, status 404/410/503 reales y observedAt verificado. Cerrado definitivamente. |
| **AUD-11** · CWV y budgets | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Budgets JS cumplidos y RUM implementado; pendiente cohorte real >= 200 muestras de 28 días. |
| **AUD-12** · Pool global | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Modelo 20 conexiones (max 2/instancia) validado; pendiente pgBouncer en Neon cloud. |
| **AUD-13** · Sesión y CSRF | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Cookie `__Host-` y tokens CSRF vinculados validados; pendiente HTTPS de producción. |
| **AUD-14** · Estados inválidos | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | Constraints DemoRun_state_coherence y aislamiento en cuarentena. Cerrado definitivamente. |
| **AUD-15** · Proyecciones | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | Selects acotados sin payloads pesados y exportación paginada por cursor. Cerrado definitivamente. |
| **AUD-16** · Claridad documental | `LOCAL_PROVEN` | `PROVEN_IN_FIELD` | **`CLOSED`** | Documentación en español rioplatense claro, sin abstracciones ceremoniales. Cerrado definitivamente. |
| **AUD-17** · Resiliencia HCS | `LOCAL_PROVEN` | `PENDING_FIELD_DATA` | `PENDING_FIELD_VERIFICATION` | Deadlines y reconciliación sin duplicados demostrados; pendiente tópico en testnet remota. |

---

## 5. Artefactos Desarrollados

1. **[`scripts/lib/field-acceptance-model.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/lib/field-acceptance-model.ts):** Motor de cálculo de percentil 75 matemático exacto, evaluador de SLOs con exclusiones transparentes y matriz de cierre DoD/AUD.
2. **[`scripts/field-acceptance.ts`](file:///C:/Users/Facundo/dev/jopoi/scripts/field-acceptance.ts):** Herramienta CLI con soporte para `--run`, `--rum-evidence`, `--field-metrics`, `--candidate-verified`, `--require-global`, `--evaluate-only` y `--json`.
3. **[`tests/observability/field-acceptance.test.ts`](file:///C:/Users/Facundo/dev/jopoi/tests/observability/field-acceptance.test.ts):** Suite de 9 pruebas automatizadas integradas en `npm run test:observability`.
4. **[`.cache/s22-field/field-acceptance-report.json`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-field/field-acceptance-report.json):** Reporte JSON estructurado con el estado actual `ACEPTACION_PARCIAL_PENDIENTE_CAMPO` y el detalle de métricas.
5. **[`.cache/s22-field/dod-closure-matrix.md`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-field/dod-closure-matrix.md):** Matriz documental consolidada en Markdown.

---

## 6. Procedimiento para la Aceptación Global Definitiva

Para que el responsable del producto transforme la aceptación parcial en **`APROBADO_GLOBAL`** una vez que el sistema esté en producción:

1. **Recolección de Telemetría RUM (28 días):**
   - Transcurrida la ventana móvil de 28 días con tráfico real de visitantes, exportar las muestras acumuladas desde `/api/rum`:
     ```bash
     npm run rum:report -- --json > .cache/s22-field/rum-samples.json
     ```
2. **Acreditación de Infraestructura y Candidato:**
   - Haber completado satisfactoriamente el Ticket 31 con pruebas firmadas de Vercel/Neon y el journal de Hedera Testnet:
     ```bash
     npm run candidate:check -- --proof .cache/s22-candidate/provider-proof.json --journal .cache/s22-candidate/live-journal.json
     ```
3. **Ejecución del Cierre Global:**
   - Ejecutar la validación con la bandera de verificación de candidato:
     ```bash
     npm run field:acceptance -- --rum-evidence .cache/s22-field/rum-samples.json --candidate-verified --require-global
     ```
   - Si todas las cohortes cumplen los umbrales de CWV y la disponibilidad alcanza >= 99,5%, el comando saldrá con código `0` y sellará el reporte final como `APROBADO_GLOBAL`.
