# Runbook: Atraso Acumulado en Publicaciones Hedera HCS

## Metadatos
- **Alerta:** `HCS_BACKLOG_STALLED`
- **Severidad:** `WARNING`
- **Responsable (Owner):** `@integracion-hedera`
- **SLO asociado:** Publicación asíncrona en Hedera HCS (cola <= 10 publicaciones, antigüedad <= 1 hora) (`AUD-09`, `AUD-17`).
- **Condición de activación:** La cola de salida (outbox) supera 10 eventos pendientes o el evento más antiguo lleva más de 1 hora (`3_600_000` ms) esperando confirmación en Hedera testnet.

---

## ⚠️ Garantía del Sistema: Persistencia SQL Intacta (Transactional Outbox)
> [!NOTE]
> **Las operaciones de negocio del usuario NO se pierden ni se revierten.**
> Jopói implementa el patrón de *Transactional Outbox*: las sesiones, recorridos, comandos e hitos se confirman y persisten inmediatamente en PostgreSQL. La publicación a Hedera Consensus Service (HCS) es asíncrona.
> Por diseño (`AUD-09`, `D14`), la sonda de preparación `/api/health/ready` devuelve **HTTP 200** con `degraded: true` ante una falla o atraso en Hedera. El orquestador **nunca** debe reiniciar la instancia por problemas en Hedera testnet.

---

## Síntomas y Diagnóstico Rápido

1. **Inspeccionar el atraso y estado de publicaciones:**
   Ejecutar el diagnóstico de operaciones:
   ```bash
   node --import tsx scripts/ops-status.ts --env-file .env.local
   ```
   o revisar el reporte de métricas:
   ```bash
   node --import tsx scripts/metrics-report.ts
   ```
   Revisar:
   - `business.publications.pendingCount`: Cantidad de eventos en cola.
   - `business.publications.oldestPendingAgeMs`: Antigüedad del evento más rezagado.
   - `business.uncertainTransactions`: Transacciones enviadas cuyo resultado quedó en incertidumbre de red (reconciliadas deterministamente por el coordinador, `AUD-17`).
   - `business.hcsQuota`: Estado del cupo diario (límite 100 envíos/día UTC en la demo).

2. **Verificar el estado de Hedera Testnet y Mirror Node:**
   - Comprobar el panel de estado oficial: [https://status.hedera.com](https://status.hedera.com).
   - Verificar la disponibilidad del Mirror Node de testnet:
     ```bash
     curl -s https://testnet.mirrornode.hedera.com/api/v1/network/nodes | head -n 5
     ```

3. **Verificar la cuota diaria (HCS Daily Quota):**
   - En la demo, el límite es de 100 mensajes diarios UTC. Si `used >= limit`, las publicaciones no se pierden pero quedan pausadas hasta el reseteo de medianoche UTC (`resetsAt`).

---

## Pasos de Mitigación

1. **NO reiniciar el contenedor:**
   El coordinador de Jopói cuenta con backoff exponencial con jitter acotado y recuperador transaccional. Reiniciar la instancia no acelera la red de Hedera y puede interrumpir la reconciliación de transacciones inciertas.

2. **Si el Mirror Node o la red testnet presentan intermitencias:**
   - Dejar que el coordinador continúe ejecutando sus tandas periódicas.
   - Si una transacción quedó en estado incierto (`uncertainTransactions > 0`), el coordinador contrastará el ID de transacción antes de cualquier nuevo envío para evitar duplicar mensajes en el topic HCS (`AUD-17`).

3. **Reconciliación manual por evento (si corresponde):**
   - Desde la interfaz web o mediante la API privada `/api/demo/runs/:traceId/events/:eventId/retry`, un usuario puede solicitar la reconciliación o reintento de un hito puntual.

---

## Criterio de Resolución y Cierre
- La alerta se resuelve automáticamente cuando `pendingPublications <= 10` y `oldestPendingAgeMs <= 3_600_000` ms.
- La sonda `/api/health/ready` vuelve a reportar `degraded: false` y `checks.hedera.status: "available"`.
