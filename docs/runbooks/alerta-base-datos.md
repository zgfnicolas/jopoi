# Runbook: Base de Datos PostgreSQL No Disponible

## Metadatos
- **Alerta:** `DATABASE_UNAVAILABLE`
- **Severidad:** `CRITICAL`
- **Responsable (Owner):** `@infraestructura-datos`
- **SLO asociado:** Disponibilidad 99,5 % y Persistencia de Operaciones.
- **Condición de activación:** La sonda `/api/health/ready` responde con HTTP 503 o las consultas SQL agotan su presupuesto de 2000 ms.

---

## Síntomas y Diagnóstico Rápido

1. **Verificar el estado de la sonda de preparación (readiness probe):**
   ```bash
   curl -i http://127.0.0.1:3000/api/health/ready
   ```
   - Si responde con HTTP 503 y cabecera `Retry-After: 5`, la aplicación no puede comunicarse con PostgreSQL.
   - Observar el cuerpo devuelto: debe contener `status: "not_ready"` o ProblemDetails con `code: "DATABASE_UNAVAILABLE"`.

2. **Verificar conectividad directa con la base de datos:**
   ```bash
   node --import tsx scripts/database.ts check --local-only
   ```
   o para entornos remotos:
   ```bash
   node --import tsx scripts/database.ts status
   ```

3. **Inspeccionar saturación y tiempos de espera del Pool:**
   Ejecutar `node --import tsx scripts/metrics-report.ts` y examinar la sección `use.pool`:
   - `errors.poolErrors`: Conexiones denegadas por pool exhausto.
   - `waitMs.p95`: Tiempo de espera en la cola de adquisición de conexión. Si p95 > 1000 ms, la base de datos o el pooler están saturados.
   - Capacidad: Recordar que Jopói asigna estrictamente `max: 2` conexiones por instancia para respetar el límite de 20 conexiones globales hacia el pooler (`AUD-12`).

---

## Pasos de Mitigación

1. **Entorno local de desarrollo / test:**
   - Si el contenedor PostgreSQL local está detenido:
     ```bash
     node --import tsx scripts/local-postgres.ts start
     ```
2. **Entorno desplegado / proveedor:**
   - Verificar si el pooler de PostgreSQL (e.g. PgBouncer / Supabase / Neon) está alcanzando el cupo máximo de clientes.
   - Comprobar que no existan transacciones bloqueadas (*deadlocks* o transacciones abiertas sin commit).
   - Verificar la latencia de red entre la instancia de cómputo y el servidor de base de datos.
3. **Comportamiento seguro de la aplicación:**
   - Jopói no pierde datos ni crea estados inconsistentes: cuando PostgreSQL no está disponible, las peticiones fallan rápido devolviendo 503 con `Retry-After` para que los clientes reintenten ordenadamente.

---

## Criterio de Resolución y Cierre
- La alerta se resuelve automáticamente cuando `/api/health/ready` devuelve HTTP 200 con `checks.database.status: "available"` y el ping SQL `SELECT 1` concluye dentro del presupuesto.
