# S22-25 · Detectar incidentes con salud, objetivos y alertas accionables (`D13`, `D14`, `AUD-02`, `AUD-04`, `AUD-09`, `AUD-17`)

## 1. Trazabilidad y Contexto

- **Spec S22:** historias 24, 28, 61, 67, 69, 70, 71, 72, 83 y 85.
- **Decisiones de arquitectura:** `D13` (observabilidad correlacionada y cardinalidad acotada) y `D14` (SLOs realistas, error budgets y alertas multi-ventana).
- **Hallazgos de auditoría:**
  - `AUD-02`: Retención, atraso de datos vencidos y eliminación física acotada.
  - `AUD-04`: Referencias de error con diagnóstico correlacionado seguro (`error.digest`, `X-Request-Id`).
  - `AUD-09`: Sondas HTTP diferenciadas, modelo de servicio medible, SLIs/SLOs separados y alertas con runbook sin reiniciar por reflejo instancias sanas.
  - `AUD-17`: Resiliencia temporal, presupuestos de paso y tolerancia a degradaciones del upstream.
- **Escenarios de verificación:** `S22-08`, `S22-26`, `S22-27` y `S22-32`.
- **Marco de presupuesto cero:** Todo el monitoreo, evaluación de SLOs, sondas de salud y despacho de alertas opera con recursos locales e in-memory sin costos de proveedores externos ni dependencias privativas.

---

## 2. Sondas de Salud HTTP Diferenciadas (`AUD-09`, `S22-32`)

Jopói implementa tres sondas con semántica y presupuestos estrictamente separados para orquestadores de contenedores y plataformas serverless:

### 2.1. Sonda de Vitalidad (Liveness) — `GET /api/health/live`
- **Objetivo:** Verificar que el proceso de Node.js y el bucle de eventos (*event loop*) responden.
- **Invariante crítica (`AUD-09`):** **NUNCA** consulta PostgreSQL ni Hedera HCS.
- **Respuesta (HTTP 200 OK):**
  ```json
  {
    "status": "live",
    "uptimeSeconds": 4320,
    "timestamp": "2026-11-14T19:00:00.000Z",
    "runtime": {
      "memoryBytes": 134217728,
      "eventLoopDelayMs": 1.25
    }
  }
  ```

### 2.2. Sonda de Preparación (Readiness) — `GET /api/health/ready`
- **Objetivo:** Determinar si la instancia puede recibir y procesar tráfico de usuario.
- **Presupuesto:** Límite estricto de 2000 ms (`sqlMaxWaitMs`).
- **Distinción entre PostgreSQL y Hedera HCS (`AUD-09`, `D14`):**
  - **PostgreSQL es crítico:** Todas las intenciones, comandos y sesiones persisten en PostgreSQL. Si la consulta `SELECT 1` falla o agota el presupuesto, responde con **HTTP 503 Service Unavailable** (`status: "not_ready"`, `DATABASE_UNAVAILABLE`) y cabecera `Retry-After: 5`.
  - **Hedera HCS es asíncrono (Transactional Outbox):** Las operaciones del usuario quedan confirmadas localmente en PostgreSQL y se publican a Hedera en segundo plano. Si Hedera testnet está lenta, caída o no configurada, la sonda responde con **HTTP 200 OK** y `degraded: true`:
    ```json
    {
      "status": "ready",
      "degraded": true,
      "timestamp": "2026-11-14T19:00:00.000Z",
      "checks": {
        "database": {
          "status": "available",
          "latencyMs": 6
        },
        "hedera": {
          "status": "degraded",
          "details": "Mirror Node testnet lento o atraso en outbox"
        }
      }
    }
    ```
    Esto garantiza que el orquestador **no reinicie por reflejo una instancia sana** que puede seguir aceptando y persistiendo operaciones de usuario.

### 2.3. Sonda de Inicio (Startup) — `GET /api/health/startup`
- **Objetivo:** Confirmar que la carga del módulo y la configuración concluyeron.
- **Justificación de entorno serverless:** En entornos serverless o contenedores efímeros con arranque bajo demanda, la sonda no ejecuta barridos pesados ni locks prolongados, respondiendo de inmediato con `{ status: "started", runtime: "serverless", initializedAt: ... }`.

---

## 3. Modelo de Servicio, SLIs y SLOs (`D14`, `AUD-09`)

| Dimensión | Indicador (SLI) | Objetivo (SLO) | Error Budget | Exclusiones Transparentes |
| :--- | :--- | :--- | :--- | :--- |
| **Disponibilidad** | $\frac{\text{Solicitudes exitosas}}{\text{Solicitudes elegibles}}$ | **99,5 %** mensual | 0,5 % | **4xx excluidos:** 400, 401, 403, 404, 409, 412, 429 no consumen presupuesto (son rechazos esperables o rate limits). **5xx computados:** 500, 502, 503 y timeouts. |
| **Latencia Escritura** | Percentiles p95 / p99 en `POST /api/demo/runs`, `POST commands` | **p95 ≤ 750 ms**, **p99 ≤ 1500 ms** | - | Rutas de lectura o llamadas lentas de red ajenas al hot-path. |
| **Latencia Lectura** | Percentiles p95 / p99 en `GET /api/v1/traces/:id` | **p95 ≤ 250 ms**, **p99 ≤ 500 ms** | - | Contraste de mirror node remoto (acotado independientemente a 6000 ms). |
| **Atraso Publicación** | Outbox de eventos pendientes y edad máxima | **Pendientes ≤ 10**, **Edad ≤ 1 h** | - | Eventos retenidos por agotamiento de cuota diaria (100 msgs/día UTC en demo). |
| **Retención / Cron** | Antigüedad del dato vencido y retraso de cron | **Edad ≤ 36 h**, **Lag cron ≤ 36 h** | - | Eliminación física en tandas acotadas por categoría sin exceder deadline de 45 s. |

---

## 4. Alertas Accionables con Multi-Ventana y Runbooks (`D14`, `AUD-09`)

El motor de alertas evalúa continuamente ventanas de tiempo basadas en las recomendaciones del Google SRE Book, evitando tanto falsos positivos en picos momentáneos como demoras en incidentes graves:

| Alerta | Severidad | Owner | Condición de Activación | Condición de Auto-Resolución | Runbook |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BURN_RATE_CRITICAL` | `CRITICAL` | `@guardia-backend` | Ventana 1 h $\ge 14.4\times$ AND ventana 5 min $\ge 14.4\times$ (tasa de error 5xx $\ge 7,2\%$) con $\ge 20$ solicitudes. Consume 2% del presupuesto en 1 hora. | Tasa de error en 5 min $< 7,2\%$ o burn rate $< 14.4\times$. | [alerta-burn-rate.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-burn-rate.md) |
| `BURN_RATE_WARNING` | `WARNING` | `@guardia-backend` | Ventana 6 h $\ge 6.0\times$ AND ventana 30 min $\ge 6.0\times$ (tasa de error 5xx $\ge 3,0\%$) con $\ge 30$ solicitudes. Consume 5% del presupuesto en 6 horas. | Tasa de error en 30 min $< 3,0\%$ o burn rate $< 6.0\times$. | [alerta-burn-rate.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-burn-rate.md) |
| `CONSECUTIVE_SERVER_ERRORS` | `WARNING` | `@guardia-backend` | $\ge 3$ errores 5xx consecutivos en períodos de bajo tráfico donde la tasa porcentual no alcanza el volumen mínimo. | Primera respuesta exitosa (2xx/3xx) observada. | [alerta-burn-rate.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-burn-rate.md) |
| `DATABASE_UNAVAILABLE` | `CRITICAL` | `@infraestructura-datos` | Sonda `/api/health/ready` devuelve 503 o ping SQL `SELECT 1` falla/agota timeout de 2000 ms. | Conexión restablecida y `SELECT 1` exitoso. | [alerta-base-datos.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-base-datos.md) |
| `CRON_ABSENT` | `WARNING` | `@operaciones-cron` | Tiempo desde el último mantenimiento exitoso $> 36\text{ h}$ (`129_600_000` ms). | Ejecución confirmada de `/api/cron` con lease liberado. | [alerta-cron-ausente.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-cron-ausente.md) |
| `RETENTION_DELAYED` | `WARNING` | `@operaciones-cron` | Antigüedad del registro vencido más viejo $> 36\text{ h}$ o categorías de limpieza estancadas. | Antigüedad $\le 36\text{ h}$ y `stalledCategories` vacío. | [alerta-cron-ausente.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-cron-ausente.md) |
| `HCS_BACKLOG_STALLED` | `WARNING` | `@integracion-hedera` | Outbox acumula $> 10$ publicaciones pendientes o el evento más antiguo lleva $> 1\text{ h}$. | Cola $\le 10$ publicaciones y antigüedad $\le 1\text{ h}$. | [alerta-hedera-atraso.md](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/alerta-hedera-atraso.md) |

---

## 5. Vistas de Error y Referencias de Diagnóstico Seguras (`AUD-04`, `AUD-09`)

1. **Error Boundaries de React (`error.tsx` y `global-error.tsx`):**
   - Reciben de forma segura el objeto de error y desestructuran `error.digest`.
   - Renderizan la referencia investigable:
     ```tsx
     {error.digest ? (
       <p className="meta" data-testid="error-reference">
         Referencia de diagnóstico: <code>{error.digest}</code>
       </p>
     ) : null}
     ```
   - **Garantía de privacidad:** Nunca exponen `error.message`, `error.stack`, sentencias SQL ni datos privados en la UI.
2. **API HTTP y Semántica de Estados:**
   - Errores 403 (`WRONG_ROLE`, `REQUEST_FORBIDDEN`): devuelven status 403 con `X-Request-Id` seguro sin cabecera `Retry-After`.
   - Errores 429 (`RATE_LIMITED`, `RUN_LIMIT_REACHED`): devuelven status 429 con cabecera `Retry-After` numérica indicando el tiempo de espera en segundos.
   - Errores 503 (`DATABASE_UNAVAILABLE`): devuelven status 503 con cabecera `Retry-After: 5` y `X-Request-Id`, reflejando fielmente la indisponibilidad de la base de datos sin alterar contratos previos.

---

## 6. Despacho a Destinos de Prueba y Acreditación Externa (`Criterio 5`)

- El despachador `AlertDispatcher` desacopla la evaluación de alertas de su transporte mediante la interfaz `AlertSink`.
- En pruebas automatizadas y ambientes de staging se utiliza `AuthorizedTestSink`, verificando que:
  1. Ante una falla inyectada (tasa de error alta, errores consecutivos, base de datos caída o cron ausente), se genera dinámicamente una notificación con estado `FIRING`, severidad, owner, runbook y metadatos saneados.
  2. Tras la recuperación del servicio, se genera una notificación de resolución con estado `RESOLVED`.
  3. No se envían notificaciones duplicadas ni se produce oscilación (*flapping*).
- El funcionamiento efectivo se acredita ejecutando el flujo completo de alertas y recuperación en la suite automatizada (`tests/observability/alerts.test.ts`), sin depender de declaraciones estáticas en archivos `.env` o `.json`.
