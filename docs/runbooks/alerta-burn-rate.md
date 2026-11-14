# Runbook: Alertas de Burn Rate y Errores de Servidor

## Metadatos
- **Alertas cubiertas:** `BURN_RATE_CRITICAL`, `BURN_RATE_WARNING`, `CONSECUTIVE_SERVER_ERRORS`
- **Severidad:** `CRITICAL` (14.4×) / `WARNING` (6× y consecutivos)
- **Responsable (Owner):** `@guardia-backend`
- **SLO asociado:** Disponibilidad de servicio 99,5 % (Error budget: 0,5 %).
- **Ventanas de cálculo:**
  - `BURN_RATE_CRITICAL`: Ventana larga 1 h (tasa >= 7,2 %) AND ventana corta 5 min (tasa >= 7,2 %).
  - `BURN_RATE_WARNING`: Ventana larga 6 h (tasa >= 3,0 %) AND ventana corta 30 min (tasa >= 3,0 %).
  - `CONSECUTIVE_SERVER_ERRORS`: >= 3 respuestas HTTP 5xx consecutivas en tráfico bajo.

---

## ⚠️ Regla de Oro: NO reiniciar por reflejo una instancia sana
> [!CAUTION]
> **No ejecutes reinicios preventivos o reflejos del contenedor/proceso.**
> Reiniciar una instancia no soluciona fallos causados por PostgreSQL, Hedera HCS o saturación del pool, y destruye el estado transaccional en memoria, cancelando peticiones en vuelo e induciendo una tormenta de reconexiones (*thundering herd*) contra la base de datos.

---

## Síntomas y Diagnóstico Rápido

1. **Obtener el reporte operativo actual:**
   Ejecutar localmente o en el contenedor:
   ```bash
   node --import tsx scripts/metrics-report.ts
   ```
   Inspeccionar el bloque `sloIndicators.availability`:
   - `errorRate`: Tasa observada de errores elegibles.
   - `serverErrors`: Cantidad de errores 5xx registrados.
   - `eligibleRequests`: Solicitudes totales evaluadas (los 4xx están transparentemente excluidos).

2. **Diferenciar 5xx de 4xx esperables:**
   - Errores 400, 401, 403, 404, 409, 412, 429 son esperables (errores del cliente o rate limits) y **no** consumen el error budget.
   - Si la alerta se activó, el problema son exclusivamente errores 500, 502 o 503.

3. **Inspeccionar eventos estructurados por `X-Request-Id`:**
   En los logs a `stderr`, buscar entradas con `severity: "ERROR"` y `event.name: "http.completed"`.
   Cada entrada contiene el identificador unívoco de diagnóstico y el stack trace seguro redactado.

4. **Verificar saturación del Event Loop o Memoria:**
   En el reporte de métricas, revisar `use.runtime`:
   - `eventLoopDelayMs.p95`: Si supera 100 ms, el proceso está bloqueado por cómputo síncrono.
   - `memoryBytes.heapUsed`: Verificar si hay fuga de memoria sostenida.

---

## Pasos de Mitigación

1. **Fallo en PostgreSQL o saturación de conexiones:**
   - Si los 5xx devuelven el código `DATABASE_UNAVAILABLE` (503):
     Consultar inmediatamente el runbook [alerta-base-datos.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-base-datos.md).
2. **Despliegue reciente defectuoso:**
   - Si el pico de errores comenzó inmediatamente tras un despliegue de código, coordinar rollback inmediato con el equipo de release.
3. **Pico de tráfico o ataque DoS:**
   - Verificar si los rate limits por IP/visitante están respondiendo correctamente (deben devolver 429 con `Retry-After`).
   - Proteger la capacidad de la base de datos sin alterar los límites de pool locales.

---

## Criterio de Resolución y Cierre
- `BURN_RATE_CRITICAL`: Se resuelve automáticamente cuando la tasa de fallas 5xx desciende de 7,2 % en la ventana de 5 minutos.
- `BURN_RATE_WARNING`: Se resuelve automáticamente cuando la tasa de fallas 5xx desciende de 3,0 % en la ventana de 30 minutos.
- `CONSECUTIVE_SERVER_ERRORS`: Se resuelve con la primera respuesta 2xx/3xx confirmada.
