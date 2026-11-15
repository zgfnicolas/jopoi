# S22-28 · Dimensionar admisión y pool con carga de producción (`D02`, `D03`, `D12`, `D14`, `D17`, `AUD-01`, `AUD-02`, `AUD-11`, `AUD-12`, `AUD-15`, `AUD-17`)

## 1. Trazabilidad y Contexto

- **Spec S22:** Historias 5, 6, 7, 14, 20, 59, 60, 61, 62, 64, 68, 69, 73, 74, 80, 82 y 85.
- **Decisiones de arquitectura:**
  - `D02`: Techos de admisión, cuotas por visitante/sesión y protección contra abuso en capa HTTP.
  - `D03`: Idempotencia de comandos, unicidad de intenciones y aislamiento de estado entre sesiones.
  - `D12`: Presupuestos de rendimiento, límites de concurrencia y medición objetiva sin extrapolaciones.
  - `D14`: Observabilidad distribuida, correlación de trazas, métricas RED/USE y cálculo exacto de percentiles.
  - `D17`: Modelo global de conexiones, parámetros estrictos de pool, localidad regional y regla de convergencia.
- **Hallazgos de auditoría:**
  - `AUD-01`: Aislamiento estricto de sesión y prevención de contaminación cruzada bajo concurrencia.
  - `AUD-02`: Limpieza sostenible, control de retención y límites de consultas periódicas.
  - `AUD-11`: Medición objetiva en entornos reales, cálculo exacto de percentiles y descarte de promedios aislados.
  - `AUD-12`: Control estricto de recursos de base de datos, multiplexación de pool y prevención de agotamiento de conexiones.
  - `AUD-15`: Tratamiento de errores uniforme sin degradar la confiabilidad del servicio.
  - `AUD-17`: Resiliencia en operaciones asíncronas con Hedera Consensus Service (HCS).
- **Escenarios de verificación:** `S22-02`, `S22-05`, `S22-06`, `S22-22`, `S22-24`, `S22-26` y `S22-28`.

---

## 2. Modelo Global de Conexiones a Base de Datos (`D17`, `AUD-12`)

El dimensionamiento de conexiones de Jopói está diseñado para sostener el servicio dentro de las restricciones del nivel gratuito de PostgreSQL serverless (Neon / PgBouncer), evitando el agotamiento de recursos o fallas de contención de pool (*pool exhaustion*).

### 2.1. Fórmula Global de Conexiones de Cliente al Pooler
$$\text{Total Clientes Pooler} = (\text{max\_instances} \times \text{per\_instance\_max}) + \text{cli} + \text{migration} + \text{operational\_reserve}$$

Sustituyendo los parámetros operativos definidos en `scripts/lib/capacity-model.ts`:
$$\text{Total Clientes Pooler} = (8 \times 2) + 1 + 1 + 2 = 20\text{ conexiones}$$

| Componente | Conexiones Asignadas | Justificación y Control |
| :--- | :--- | :--- |
| **Instancias Web Serverless** | **16** ($8 \text{ instancias} \times 2 \text{ conn}$) | Límite máximo de concurrencia horizontal documentado de funciones serverless simultáneas. |
| **Herramientas CLI** | **1** | Mantenimiento, diagnósticos o ejecución de utilidades operativas. |
| **Migraciones de Esquema** | **1** | Conexión dedicada para `prisma migrate deploy` en canal de CI/CD. |
| **Reserva Operativa** | **2** | Margen para inspección administrativa o resolución de incidentes en caliente. |
| **Total Global** | **20** | **Total de conexiones cliente hacia el pooler transaccional.** |

### 2.2. Distinción entre Clientes del Pooler y Servidor Backend PostgreSQL
El sistema distingue conceptualmente entre dos niveles de red:
1. **Conexiones de cliente hacia el pooler (PgBouncer / Neon Pooling):** El pooler transaccional acepta hasta miles de conexiones de cliente abiertas en espera. Jopói acota estrictamente a **20 conexiones cliente**.
2. **Conexiones físicas hacia el backend de PostgreSQL:** En modo de pooling de transacciones (*transaction pooling*), una conexión física al motor de PostgreSQL sólo se mantiene durante la ejecución activa de una transacción o consulta (`withDatabase` / `withTransaction`). Finalizada la sentencia, la conexión física se libera inmediatamente al pool interno.
3. **Conexiones backend físicas requeridas:** Un grupo de **4 a 6 conexiones backend PostgreSQL** es plenamente suficiente para atender las 20 conexiones cliente bajo una concurrencia real de 8 solicitudes simultáneas.

### 2.3. Parámetros Estrictos de Configuración de la Instancia
- `max: 2`: Límite estricto de conexiones simultáneas por instancia serverless individual.
- `min: 0`: Cero conexiones ociosas permanentes (esencial para la naturaleza efímera serverless).
- `connectionTimeoutMs: 3000`: Timeout máximo de 3 segundos para obtener una conexión del pool.
- `idleTimeoutMs: 10000`: Cierre de conexiones ociosas tras 10 segundos de inactividad.
- `statementTimeoutMs: 5000`: Cancelación preventiva de cualquier sentencia SQL que exceda 5 segundos.
- `queryTimeoutMs: 5500`: Límite superior de seguridad para la resolución de promesas de consulta.
- `timezoneOption: "-c timezone=UTC"`: Invariante temporal UTC forzado a nivel de sesión PostgreSQL.
- `sslMode: "verify-full"`: Cifrado en tránsito y verificación criptográfica estricta de certificado TLS.

### 2.4. Localidad Geográfica y Rechazo de Edge Rendering (`D17`)
- **Región de Funciones Serverless:** `iad1` (Washington D.C. / US East, Vercel).
- **Región de Base de Datos PostgreSQL:** `us-east-1` (N. Virginia / US East, AWS / Neon).
- **Latencia de Red Intra-Región Esperada:** $< 2\text{ ms}$ por consulta SQL.

> [!IMPORTANT]
> **Razón documentada del rechazo de Edge Rendering:**
> El renderizado en Edge distribuye código de ejecución en cientos de puntos de presencia (*PoPs*) alrededor del mundo. Dado que la base de datos transaccional con estado reside de forma centralizada en una única región (`us-east-1`), cualquier consulta desde un nodo Edge remoto (Europa, Asia, Oceanía) incurre en una penalización de red de $40\text{ a }150+\text{ ms}$ por cada viaje de ida y vuelta (*round-trip*), multiplicando la latencia en transacciones secuenciales.
> Además, los entornos Edge carecen de soporte maduro para pooling TCP transaccional y agotan con rapidez las cuotas de conexión de la base de datos. Co-ubicar las funciones serverless Node.js en la misma región que la base de datos (`iad1` $\leftrightarrow$ `us-east-1`) garantiza una latencia de red SQL inferior a 2 ms y permite un control determinista del pool.

---

## 3. Techos de Admisión Respaldados por Medición (`D02`, `D03`, `AUD-01`)

Los techos de admisión del servicio están configurados y verificados en `src/server/security/rate-limit.ts` y `src/shared/demo-policy.ts`:

### 3.1. Cuotas Diarias Globales
- **Nuevas Sesiones:** 100 sesiones/día.
- **Solicitudes de Contacto Demo:** 100 solicitudes/día.
- **Intenciones / Comandos:** 5.000 intenciones/día.

### 3.2. Límites por Visitante y Sesión en Ventana Corta
- **Creación de Sesión:** 20 solicitudes en 10 minutos por IP visitante (`global: 200`).
- **Contacto Comercial:** 5 solicitudes por hora por IP visitante (`global: 100`).
- **Mutación de Recorrido (Comandos):** 10 mutaciones por minuto por sesión (`global: 100/min`).
- **Lectura Privada de Recorrido:** 30 lecturas por minuto por sesión (`global: 1000/min`).
- **Consulta Pública de Trazabilidad:** 120 consultas por minuto por visitante (`global: 1000/min`).

---

## 4. Ensayo de Capacidad en Build de Producción (`S22-22`, `AUD-11`)

El ensayo de capacidad se implementó en `scripts/capacity-benchmark.ts` y fue ejecutado sobre un clúster local de PostgreSQL 17 utilizando un **build real de producción** (`next start`), descartando categóricamente mediciones sobre el servidor de desarrollo (`next dev`) o extrapolaciones lineales de promedios.

### 4.1. Dataset Sintético Equivalente a S21
Para evaluar el comportamiento de la base de datos bajo volumen de producción acumulado, se inyectaron 60.000 filas relacionales sintéticas:
- **Sesiones:** 1.000 sesiones activas.
- **Recorridos:** 3.000 recorridos operativos.
- **Recibos de Comandos:** 15.000 recibos (`CommandReceipt`).
- **Eventos de Operación:** 15.000 eventos (`OperationEvent`).
- **Publicaciones HCS:** 15.000 registros de publicación (`HcsPublication`).
- **Solicitudes de Contacto:** 10.000 solicitudes de demostración (`DemoRequest`).
- **Planes de Consulta Validados:** Se ejecutó `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre las consultas de exportación, limpieza y publicaciones pendientes, confirmando escaneos de índice óptimos (`Index Scan` / `Index Only Scan`).

### 4.2. Medición de Arranque Frío (Cold Start)
- **Ruta evaluada:** `POST /api/demo/session` (primera invocación dinámica post-arranque).
- **Latencia observada:** **601.73 ms**.
- **Objetivo SLO:** $\le 2.000\text{ ms}$.
- **Evaluación:** **DENTRO DE OBJETIVO (APROBADO)**.

### 4.3. Mediciones en Estado Caliente (Warm State)
Se evaluaron las rutas dinámicas clave bajo **concurrencia 1** (línea base secuencial) y **concurrencia 8** (saturación en paralelo con 8 clientes aislados simultáneos, cada uno con su propia sesión, IP e historial).

> [!NOTE]
> **Separación de HCS posterior al commit:**
> Las operaciones de mutación registran el comando y evento atómicamente en la base de datos relacional y programan la publicación asíncrona en `HcsPublication`. La confirmación HTTP al cliente no bloquea en la espera de la red Hedera, desacoplando el tiempo de respuesta de la latencia de consenso externa.

| Ruta Evaluada | Método | Concurrencia | Muestras | p50 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Conex DB | Estado SLO |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`/api/demo/session`** | `POST` | 1 | 10 | 51.0 | 64.2 | 75.5 | 75.5 | 2 / 2 | **APROBADO** |
| **`/api/demo/session`** | `POST` | **8** | 40 | 209.4 | 334.1 | **352.3** | **480.8** | 2 / 2 | **APROBADO** |
| **`/api/demo/runs/:id`** | `GET` | 1 | 10 | 39.5 | 44.5 | 45.0 | 45.0 | 2 / 2 | **APROBADO** |
| **`/api/demo/runs/:id`** | `GET` | **8** | 40 | 243.6 | 327.3 | **340.9** | **358.2** | 2 / 2 | **APROBADO** |
| **`/api/traces/:id`** | `GET` | 1 | 15 | 42.4 | 50.5 | 51.5 | 51.5 | 2 / 2 | **APROBADO** |
| **`/api/traces/:id`** | `GET` | **8** | 40 | 242.2 | 298.0 | **299.2** | **324.0** | 2 / 2 | **APROBADO** |
| **`/api/demo/runs/:id/commands`** | `POST` | 1 | 3 | 46.0 | 54.3 | 54.3 | 54.3 | 2 / 2 | **APROBADO** |
| **`/api/demo/runs/:id/commands`** | `POST` | **8** | 24 | 367.6 | 513.9 | **524.3** | **586.4** | 2 / 2 | **APROBADO** |

#### Cumplimiento de SLOs de Latencia y Capacidad:
- **SLO p95 Caliente ($\le 750\text{ ms}$):** Máximo registrado bajo concurrencia 8: **524.3 ms** (`commands_replay`), holgadamente inferior a los 750 ms permitidos.
- **SLO p99 Caliente ($\le 1.500\text{ ms}$):** Máximo registrado bajo concurrencia 8: **586.4 ms** (`commands_replay`), holgadamente inferior a los 1.500 ms permitidos.
- **Conexiones simultáneas por instancia ($\le 2$):** Exactamente 2 conexiones observadas en saturación máxima, respetando la directiva de contención.
- **Errores no esperados:** **0 errores HTTP** (cero 500/503 imprevistos).

---

## 5. Consumo de Memoria y Recursos (`D17`, `AUD-12`)

El uso de memoria del proceso de ejecución se mantuvo estrictamente acotado durante todo el ciclo del benchmark:
- **Heap inicial:** 15.88 MiB.
- **Heap final:** 22.40 MiB (Delta: +6.52 MiB).
- **RSS final:** 60.58 MiB (Presupuesto máximo permitido: $\le 250\text{ MiB}$).
- **Event Loop & Colector:** Ausencia de fugas de memoria o retención de buffers en los colectores de métricas y diagnósticos.

---

## 6. Regla de Convergencia (`D02`, `D03`, `D17`, `AUD-01`)

La política de convergencia (`convergencePolicy` en `scripts/lib/capacity-model.ts`) establece el procedimiento reglamentario ante variaciones de carga o degradación de rendimiento:

```typescript
export function convergencePolicy(measuredP95Ms: number, measuredP99Ms: number): {
  action: "MAINTAIN" | "REDUCE_ADMISSION";
  recommendation: string;
};
```

### Principio Fundamental:
> Si las mediciones bajo carga no sostienen los topes propuestos (p95 $> 750\text{ ms}$ o p99 $> 1.500\text{ ms}$), **se debe reducir la tasa de admisión** (disminuir cuotas por minuto por sesión o limitar lecturas privadas) o mejorar la capacidad mediante optimización demostrada con evidencia.
>
> **Queda estrictamente prohibido:**
> 1. Aumentar arbitrariamente el tamaño del pool por intuición.
> 2. Contratar un plan de pago o actualizar la infraestructura con costo sin evidencia científica que demuestre que el código y el esquema son óptimos.

En el presente ensayo, la acción resultante es **`MAINTAIN`**, dado que todos los percentiles cumplieron los márgenes requeridos.

---

## 7. Separación de Incumbencias: Local Comprobado vs Proveedor Pendiente (`Ticket 31`)

Para cumplir con la directiva de rigor metodológico de Jopói y evitar falsas declaraciones de conformidad, el informe técnico (`.cache/s22-capacity/capacity-report.json`) separa explícitamente la capacidad local comprobada de la validación final en la nube:

```json
"separationOfConcerns": {
  "localProvenCapacity": true,
  "providerPending": true,
  "globalAcceptance": false,
  "pendingExternalVerification": [
    "Verificación de latencia intra-región real hosting (Vercel iad1) <-> base de datos (Neon us-east-1) (Ticket 31)",
    "Verificación de límite de conexiones del pooler de Neon gratuito (pgBouncer transaction pooling) (Ticket 31)",
    "Acreditación de TLS estricto, grants de roles y backup/restore en hosting real (Ticket 31)"
  ]
}
```

- **Capacidad Local Comprobada (`localProvenCapacity: true`):** Demuestra que el build de producción de Jopói, el motor de base de datos relacional y las consultas indexadas soportan la concurrencia y dataset requeridos bajo el modelo de conexiones previsto.
- **Proveedor Pendiente (`providerPending: true`):** Reconoce que las características de red del proveedor real de hosting (latencia real de Vercel a Neon, límites de cuota de conexiones del endpoint de PgBouncer en Neon) deben ser auditadas en el entorno real de despliegue.
- **Aceptación Global Bloqueada (`globalAcceptance: false`):** La aceptación global de infraestructura y producción queda formalmente delegada al **Ticket 31** (*Validación en staging/producción real y resiliencia de proveedor*).
