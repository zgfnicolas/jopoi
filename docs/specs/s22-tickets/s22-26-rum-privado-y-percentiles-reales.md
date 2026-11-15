# S22-26 · Medir la experiencia real sin exportar datos privados (`D02`, `D12`, `D13`, `AUD-09`, `AUD-11`)

## 1. Trazabilidad y Contexto

- **Spec S22:** Historias 27, 51, 57, 58, 68, 83, 84, 85 y 86.
- **Decisiones de arquitectura:**
  - `D02`: Protección de privacidad y confidencialidad de participantes.
  - `D12`: Ingesta segura y contratos estrictos en fronteras públicas.
  - `D13`: Observabilidad correlacionada con cardinalidad estrictamente acotada.
- **Hallazgos de auditoría:**
  - `AUD-09`: Observabilidad de servicio y evaluación objetiva de experiencia de usuario.
  - `AUD-11`: Medición de Core Web Vitals reales en visitantes (RUM) sin fugas de PII, sin sustitución falaz de INP por TBT, sin promedios cruzados y con exigencia de volumen estadísticamente representativo (≥ 200 muestras).
- **Escenarios de verificación:** `S22-01`, `S22-23`, `S22-26` y `S22-32`.
- **Marco de presupuesto cero:** Telemetría nativa del navegador mediante `useReportWebVitals` de Next.js sin añadir librerías pesadas ni servicios de terceros.

---

## 2. Principios de Privacidad y Minimización Radical (`AUD-11`, `D02`, `D13`)

La telemetría tradicional de frontend con frecuencia filtra información privada sensible: URLs completas con parámetros o tokens, identificadores de sesión/trazabilidad, direcciones IP o encabezados completos del cliente (User-Agent con huella digital de hardware).

Jopói adopta un modelo de **minimización radical** donde el navegador transmite únicamente un esquema cerrado inmutable:

```typescript
export const rumMetricInputSchema = z.strictObject({
  metric: z.enum(["LCP", "INP", "CLS"]),
  value: z.number().nonnegative().finite(),
  route: z.enum(["/", "/demo", "/trazabilidad/:traceId", "other"]),
  device: z.enum(["desktop", "mobile", "tablet"]),
  version: z.string().min(1).max(32),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  connection: z.enum(["4g", "3g", "2g", "slow-2g", "unknown"]).optional(),
});
```

### Invariantes de Privacidad Garantizadas
1. **Sin URLs completas:** Se utiliza exclusivamente una plantilla de ruta canónica anonimizada (`"/"`, `"/demo"`, `"/trazabilidad/:traceId"` u `"other"`). No se transmiten query strings, parámetros de búsqueda ni fragmentos.
2. **Sin UUIDs ni identificadores:** Los IDs reales de trazabilidad (`[traceId]`) o eventos se normalizan a la plantilla literal `"/trazabilidad/:traceId"`.
3. **Sin User-Agent Sniffing:** La clase de dispositivo se deduce en el cliente exclusivamente a partir de Media Queries estándar (`matchMedia`), preservando la privacidad del navegador y evitando huellas digitales (*fingerprinting*):
   - `mobile`: `(max-width: 768px) and (pointer: coarse)`
   - `tablet`: `(max-width: 1024px)`
   - `desktop`: resto de resoluciones.
4. **Sin PII ni datos de contacto:** El esquema rechaza mediante `.strict()` cualquier campo adicional (`email`, `userId`, `cookie`, `token`, `headers`, `ip`, etc.).
5. **Carga útil estrictamente acotada:** La ingesta HTTP limita el tamaño del cuerpo a un máximo de **2048 bytes**, abortando streams lentos o gigantescos antes de consumir memoria.

---

## 3. Ingesta HTTP y Protección contra Sobrecarga (`/api/rum`)

El endpoint `POST /api/rum` procesa las métricas enviadas por el navegador (vía `navigator.sendBeacon` o `fetch` con `keepalive: true`):

```
+-------------------+      POST /api/rum        +-------------------------+
|  RumCollector     | -----------------------> |  apiBoundary:           |
|  (useReportWeb    |   (<= 2048 bytes JSON)   |  1. Rate Limit Check    |
|   Vitals)         |                          |  2. readJsonBody(2048)  |
+-------------------+                          |  3. Zod strict parse    |
                                               |  4. recordRumMetric     |
                                               +-------------------------+
                                                            |
                                                            v
                                               +-------------------------+
                                               |  rumStore (In-Memory)   |
                                               |  Max 36 Cohortes        |
                                               |  Max 1000 muestras/coh  |
                                               |  TTL 28 días            |
                                               +-------------------------+
```

### Controles de Tasa y Resiliencia
- **Límite por visitante:** Máximo **60 peticiones/minuto** por dirección IP. Ante exceso, devuelve **HTTP 429 Too Many Requests** con cabecera `Retry-After`.
- **Límite global:** Máximo **1000 peticiones/minuto** en toda la instancia.
- **Sin efectos colaterales de dominio:** La telemetría inválida (400) o descartada por cuota (429) **no** genera eventos en la base de datos, no despierta transacciones SQL ni escribe en Hedera HCS.

---

## 4. Cardinalidad Acotada y Almacenamiento en Memoria

Para evitar fugas de memoria o multiplicación de series métricas (`D13`):
- **Cohortes cerradas:** Definidas como `route:device:metric`.
  $$\text{Cardinalidad máxima} = 4 \text{ rutas} \times 3 \text{ dispositivos} \times 3 \text{ métricas} = 36 \text{ cohortes}$$
- **Tope de memoria:** Cada cohorte retiene un máximo de 1000 muestras (`MAX_SAMPLES_PER_COHORT = 1000`). Muestras adicionales descartan las más antiguas.
- **Ventana móvil de 28 días:** Cada muestra registra únicamente `{ value, timestamp }`. Muestras anteriores a $now - 28\text{ días}$ son depuradas automáticamente.
- **Consumo total:** El almacén completo de RUM en memoria ocupa menos de 600 KB en su capacidad máxima teórica.

---

## 5. Regla de Evidencia Suficiente y Objetivos Core Web Vitals (`AUD-11`)

### 5.1. Umbral Estadístico de 200 Muestras
Para evitar la falacia de declarar un sitio "conforme" basándose en unas pocas visitas de desarrolladores en entornos ideales, Jopói exige al menos **200 muestras válidas por cohorte** dentro de la ventana móvil de 28 días (`RUM_MIN_SAMPLE_COUNT = 200`).
- Si una cohorte tiene menos de 200 muestras (ej. 199):
  - `status: "INSUFFICIENT_DATA"`
  - `hasSufficientData: false`
  - `p75: null`
  - `withinTarget: null`
  - `rating: "insufficient_data"`
  - Se explicita en el informe la falta de evidencia empírica.

### 5.2. Objetivos de Core Web Vitals Evaluados en p75
Siguiendo los estándares de Google y W3C:
| Métrica | Objetivo Bueno (`good`) | A Mejorar (`needs-improvement`) | Pobre (`poor`) |
| :--- | :--- | :--- | :--- |
| **LCP** (Largest Contentful Paint) | $\le 2500\text{ ms}$ | $\le 4000\text{ ms}$ | $> 4000\text{ ms}$ |
| **INP** (Interaction to Next Paint) | $\le 200\text{ ms}$ | $\le 500\text{ ms}$ | $> 500\text{ ms}$ |
| **CLS** (Cumulative Layout Shift) | $\le 0.10$ | $\le 0.25$ | $> 0.25$ |

### 5.3. Prohibición de Sustitución TBT $\to$ INP
Total Blocking Time (TBT) es una métrica sintética de laboratorio (Lighthouse) basada en simulación estática sin interacción del usuario. **Jopói prohíbe expresamente reportar TBT como sustituto de INP de campo**.
El reporte exportado sella explícitamente:
```json
"inpIsLaboratoryTbt": false
```

### 5.4. Prohibición de Agregación Cruzada de Rutas
Promediar métricas de diferentes rutas (ej. combinar `/` con `/demo`) oculta regresiones severas en flujos interactivos pesados.
Cada una de las 36 cohortes se reporta y audita individualmente. El cumplimiento global (`overallCompliant`) requiere que **todas** las cohortes con datos suficientes cumplan sus metas de forma simultánea.

---

## 6. Herramienta de Línea de Comandos (`rum:report`)

Se dispone de un comando CLI para auditar la telemetría RUM en entornos de operación:

```bash
# Reporte tabular legible por humanos
npm run rum:report

# Reporte en formato JSON estándar (schemaVersion: 1)
npm run rum:report -- --json

# Calibración del mínimo de muestras (para auditorías o staging)
npm run rum:report -- --min-samples 50

# Exportar a un archivo específico
npm run rum:report -- --json --output .cache/reports/rum.json
```

### Ejemplo de Salida Tabular
```
================================================================================
  Jopói · Informe RUM de Rendimiento Real (Core Web Vitals p75)
================================================================================
  Generado:               2026-11-14T20:00:00.000Z
  Ventana móvil:          28 días
  Mínimo por cohorte:     200 muestras requeridas
  TBT como INP:           NO (INP de campo real: verdadero)
  Cohortes evaluadas:     36
  Cohortes suficientes:   2
  Cohortes conformes:     2
  Cumplimiento global:    CONFORME (todas las cohortes suficientes cumplen la meta)
--------------------------------------------------------------------------------
Ruta                      Dispositivo Métrica Muestras p75      Meta     Estado       Evaluación
--------------------------------------------------------------------------------
/                         desktop     LCP     240      1100 ms  2500 ms  SUFICIENTE   good
/demo                     mobile      INP     215      140 ms   200 ms   SUFICIENTE   good
================================================================================
```

---

## 7. Verificación Automatizada

La suite completa en `tests/observability/rum.test.ts` valida:
1. Rechazo estricto por Zod de PII, URLs completas, UUIDs, User-Agent, y campos ajenos.
2. Comprobación de límites de cuerpo (2048 bytes) y de tasa (60/min cliente, 1000/min global) retornando HTTP 429 con `Retry-After`.
3. Cálculo exacto del percentil 75 matemático.
4. Acotamiento en memoria de muestras (máximo 1000 por cohorte).
5. Descarte estricto de muestras fuera de la ventana móvil de 28 días.
6. Bloqueo de falsos cumplimientos: con 199 muestras retorna `INSUFFICIENT_DATA`; con 200 calcula y califica.
7. Independencia de cohortes: degradación en `/demo` no queda enmascarada por `/`.
8. Verificación de CLI `scripts/rum-report.ts` en modos tabular y JSON.
