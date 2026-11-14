# Runbook: Mantenimiento Periódico Ausente o Retención Demorada

## Metadatos
- **Alertas cubiertas:** `CRON_ABSENT`, `RETENTION_DELAYED`
- **Severidad:** `WARNING`
- **Responsable (Owner):** `@operaciones-cron`
- **SLO asociado:** Mantenimiento oportuno y eliminación física dentro de 36 horas (`129_600_000` ms) (`AUD-02`, `D03`, `D14`).
- **Condiciones de activación:**
  - `CRON_ABSENT`: Tiempo transcurrido desde el último mantenimiento exitoso > 36 horas.
  - `RETENTION_DELAYED`: Edad del registro expirado más antiguo > 36 horas o categorías de limpieza estancadas (`stalledCategories.length > 0`).

---

## Síntomas y Diagnóstico Rápido

1. **Inspeccionar el estado del programador y atraso:**
   Ejecutar el script de diagnóstico operacional:
   ```bash
   node --import tsx scripts/ops-status.ts --env-file .env.local
   ```
   o consultar el reporte de métricas:
   ```bash
   node --import tsx scripts/metrics-report.ts
   ```
   Revisar los indicadores:
   - `sloIndicators.maintenance.cronLagMs`: Tiempo desde la última ejecución confirmada.
   - `sloIndicators.maintenance.oldestExpiredAgeMs`: Edad del dato vencido sin borrar.
   - `sloIndicators.maintenance.cronHealthy`: Booleano del objetivo.
   - `business.maintenance.stalledCategories`: Categorías con trabajo pendiente que no lograron avanzar en la última tanda.

2. **Verificar el servicio de disparo del cron:**
   - Comprobar que el programador externo (Vercel Cron / GitHub Actions / Cron job local) esté enviando la petición GET a `/api/cron`.
   - Verificar que la cabecera `Authorization: Bearer <CRON_SECRET>` esté presente y configurada correctamente. Si el token no coincide, `/api/cron` responde con 401 (`MAINTENANCE_UNAUTHORIZED`).

3. **Verificar leases y concurrencia:**
   - Jopói utiliza un lease transaccional (`DAILY_MAINTENANCE`) para impedir que dos ejecuciones compitan entre sí o saturen la base de datos.
   - Si una ejecución previa falló a mitad de camino, el lease expirará de forma segura sin dejar bloqueos permanentes.

---

## Pasos de Mitigación

1. **Disparo manual del mantenimiento:**
   Ejecutar el script administrativo con entorno explícito:
   ```bash
   node --import tsx scripts/maintenance.ts --env-file .env.local
   ```
   o realizar una solicitud HTTP autenticada:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron
   ```

2. **Progreso determinista por tandas (`D03`, `D14`):**
   - El cron divide la limpieza en tandas acotadas por categoría (`rateBuckets`, `runs`, `contacts`, `sessions`, `quotas`, `leases`) con un presupuesto total de 45 segundos para no monopolizar el pool SQL.
   - Si se acumuló un gran volumen de datos, ejecutar 2 o 3 tandas consecutivas hasta que `complete: true` o `cleanup.pending` disminuya a cero.

3. **Verificación de categorías estancadas:**
   - Si una categoría específica falla repetidamente, inspeccionar los logs a `stderr` con `event.name: "maintenance.completed"` para identificar si ocurrió una violación de clave foránea o timeout.

---

## Criterio de Resolución y Cierre
- `CRON_ABSENT`: Se resuelve automáticamente en cuanto se registra una ejecución exitosa (`cronLagMs <= 129_600_000` ms).
- `RETENTION_DELAYED`: Se resuelve cuando la antigüedad del registro más viejo es menor a 36 horas y no quedan categorías estancadas.
