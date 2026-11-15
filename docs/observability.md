# Confiabilidad y Observabilidad — Jopói

Este documento consolida la arquitectura de observabilidad, los objetivos de nivel de servicio (SLOs), los presupuestos de error, el sistema de alertas proactivas y el catálogo de runbooks operativos implementados en **Jopói** (S22).

---

## 1. Objetivos de Nivel de Servicio (SLOs) y Presupuestos de Error

Jopói define formalmente sus compromisos de confiabilidad sobre ventanas móviles de 30 días:

| Indicador de Nivel de Servicio (SLI) | Objetivo (SLO) | Presupuesto de Error | Impacto si se agota |
| :--- | :---: | :---: | :--- |
| **Disponibilidad de Lectura y QR** | **>= 99.50%** | **0.50%** (máx. 3.6 h/mes) | Bloqueo de nuevos features; prioridad absoluta a estabilización de infraestructura. |
| **Latencia de Endpoints Operativos (p95)** | **< 500 ms** | **5% de requests > 500ms** | Optimización de índices en PostgreSQL y reducción de carga en consultas. |
| **Éxito de Publicación Outbox en HCS** | **>= 99.00%** | **1.00% de fallos** | Revisión de balance en cuenta operadora y reintentos automáticos. |
| **Rendimiento Frontend (LCP)** | **< 2.5 s** en p75 | **25% de visitas > 2.5s** | Revisión de presupuestos de bundle y carga de recursos críticos. |

---

## 2. Monitoreo de RUM Privado (Real User Monitoring)

Para respetar la privacidad de los visitantes y el principio de presupuesto cero, Jopói utiliza un sistema propio de recolección de Web Vitals:
- **Componente cliente:** [`RumCollector`](file:///C:/Users/Facundo/dev/jopoi/src/components/rum-collector.tsx) captura eventos estándar de PerformanceObserver (LCP, CLS, INP, TTFB).
- **Envío anónimo:** Utiliza `navigator.sendBeacon` hacia `/api/v1/rum` al cambiar de visibilidad o cerrar la pestaña.
- **Sin datos personales:** No se recolectan direcciones IP, cookies de usuario, agentes de usuario completos ni huellas digitales.
- **Percentiles calculados:** El endpoint procesa los valores en buffers circulares en memoria, exponiendo percentiles p50, p75 y p95 para auditoría.

---

## 3. Sistema de Alertas y Severidades

Las alertas se evalúan periódicamente mediante comprobaciones sintéticas y durante las pruebas de observabilidad:

| Código de Alerta | Severidad | Condición de Disparo | Runbook Operativo Asociado |
| :--- | :---: | :--- | :--- |
| `ERR_BURN_RATE_CRITICAL` | **Crítica** | Consumo acelerado del presupuesto de error (> 14x burn rate en 1h). | [alerta-burn-rate.md](runbooks/alerta-burn-rate.md) |
| `ERR_DATABASE_UNAVAILABLE`| **Crítica** | Conexiones fallidas consecutivas contra PostgreSQL / Neon. | [alerta-base-datos.md](runbooks/alerta-base-datos.md) |
| `ERR_HCS_BACKLOG_HIGH` | **Alta** | Más de 10 eventos pendientes en cola Outbox o atraso > 15 min. | [alerta-hedera-atraso.md](runbooks/alerta-hedera-atraso.md) |
| `ERR_CRON_MISSING` | **Media** | No se registró ejecución exitosa del barrido diario en > 30 horas. | [alerta-cron-ausente.md](runbooks/alerta-cron-ausente.md) |

---

## 4. Catálogo de Runbooks Operativos

Los runbooks proporcionan instrucciones paso a paso para el diagnóstico y resolución de incidentes:

1. [**Runbook: Alerta de Consumo Acelerado de Error Budget (Burn Rate)**](runbooks/alerta-burn-rate.md)  
   Diagnóstico de caídas masivas de disponibilidad y contención de fallos en rutas críticas.
2. [**Runbook: Alerta de Indisponibilidad de Base de Datos**](runbooks/alerta-base-datos.md)  
   Resolución de saturación de conexiones en el pool de Neon, reanudación tras suspensión por inactividad y verificación de credenciales.
3. [**Runbook: Alerta de Atraso en Publicaciones HCS**](runbooks/alerta-hedera-atraso.md)  
   Diagnóstico de demoras en la red Hedera testnet, verificación de saldo del operador y reintento forzado de la cola Outbox.
4. [**Runbook: Alerta de Ausencia del Barrido Diario (Cron)**](runbooks/alerta-cron-ausente.md)  
   Ejecución manual del barrido diario de mantenimiento, purga de sesiones vencidas y liberación de leases huérfanos.

---

## 5. Acceso a Logs y Diagnósticos Seguros

- **Formato de Logs:** Estructurados en JSON emitidos a `stderr` / `stdout`.
- **Saneamiento estricto:** Los logs excluyen automáticamente cookies, tokens de sesión, direcciones de correo y datos de contacto (`DemoRequest`).
- **Correlación de trazas:** Cada log incluye `traceId`, `spanId` y `requestId` alineados con el estándar W3C TraceContext para permitir la reconstrucción del flujo de una petición sin exponer datos confidenciales.
