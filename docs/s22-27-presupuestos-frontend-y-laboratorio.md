# S22-27 · Mantener rápidas las tres rutas con un gate de producción (`D09`, `D11`, `D12`, `D19`, `AUD-06`, `AUD-10`, `AUD-11`, `AUD-16`)

## 1. Trazabilidad y Contexto

- **Spec S22:** Historias 33, 35, 43, 44, 51, 53, 56, 57, 59 y 81.
- **Decisiones de arquitectura:**
  - `D09`: Navegador, política CSP estricta y hashes de scripts sin `unsafe-inline` general.
  - `D11`: Estrategia por ruta, entrega inicial HTML/RSC y datos iniciales sin JavaScript.
  - `D12`: Presupuestos estrictos de JavaScript comprimido y gate de laboratorio Core Web Vitals.
  - `D19`: Puertas de calidad reproducibles, documentación clara y prevención de regresiones.
- **Hallazgos de auditoría:**
  - `AUD-06`: Cabeceras de seguridad y CSP efectiva con funcionamiento verificado del framework.
  - `AUD-10`: Renderizado inicial útil, status reales y ausencia de `suppressHydrationWarning` espurios.
  - `AUD-11`: Medición objetiva de CWV, separación estricta entre TBT de laboratorio e INP de campo, y presupuestos de JS transferido.
  - `AUD-16`: Claridad conceptual, código sin artificios ceremoniales ni waterfalls artificiales.
- **Escenarios de verificación:** `S22-15`, `S22-19`, `S22-20`, `S22-21`, `S22-22` y `S22-31`.

---

## 2. Presupuestos de JavaScript Transferido Inicial Comprimido (`D12`, `AUD-11`)

Para garantizar tiempos de carga y respuesta inmediatos en redes móviles y dispositivos de recursos acotados, Jopói impone límites estrictos de tamaño para el JavaScript inicial comprimido (gzip):

| Ruta | Presupuesto Máximo | Tamaño Medido (Gzip) | % del Presupuesto | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **Landing (`/`)** | **$\le 200\text{ KiB}$** | **184.09 KiB** | 92% | **APROBADO** |
| **Demo (`/demo`)** | **$\le 300\text{ KiB}$** | **200.56 KiB** | 67% | **APROBADO** |
| **Trazabilidad (`/trazabilidad/:traceId`)** | **$\le 250\text{ KiB}$** | **128.54 KiB** | 51% | **APROBADO** |
| **Módulo QR (Diferido)** | *Medido aparte* | **32.64 KiB** | — | **APROBADO** |

### Reglas de Medición:
1. **Módulos efectivamente requeridos:** Se computan todos los chunks de framework (React, Next.js bootstrap, turbopack runtime) y los módulos iniciales requeridos para renderizar la ruta.
2. **Exclusión de source maps:** Los mapas `.map` se excluyen de la métrica de transferencia.
3. **Distinción de polyfills de legado (`nomodule`):** El bundle `0cz1d0mv5g_q7.js` (39.6 KiB gzip) se emite con `<script ... noModule="">` exclusivamente para navegadores obsoletos sin soporte de módulos ES. Los navegadores modernos que evalúan Core Web Vitals ignoran este archivo por especificación HTML5, transfiriendo estrictamente **184.09 KiB** en la landing.
4. **Carga diferida del código QR:** El módulo `qrcode` se importa dinámicamente (`void import("qrcode")`) en `src/components/trace-share.tsx` y solo se descarga cuando el usuario interactúa con la trazabilidad, manteniéndolo fuera del camino crítico de inicio.

---

## 3. Integridad de Recursos Críticos y Ausencia de Artificios (`AUD-10`, `AUD-16`)

Jopói prohíbe la fragmentación artificial de componentes (*micro-boundaries*) o cascadas de carga (*waterfalls*) introducidos exclusivamente para maquillar métricas de laboratorio:

1. **Imagen crítica prioritaria:** La fotografía principal de la landing (`chipsPhoto`) utiliza el componente `Image` de Next.js con atributo `preload` / `priority`, generando cabeceras de precarga de alta prioridad (`fetchPriority="high"`), `srcset` responsivo y dimensiones explícitas (`sizes`), eliminando saltos de diseño (CLS = 0).
2. **Tipografía local con fallbacks:** Las fuentes del sistema y encabezados declaran fallbacks estándar en CSS (`sans-serif` y `serif`) para evitar el destello de texto invisible (*FOIT*).
3. **Reserva de geometría del código QR:** El contenedor del código QR define `.qr { width: 256px; }` y el marcador de carga `.placeholder { aspect-ratio: 1; }` en `src/components/trace-share.module.css`. Esto reserva un espacio geométrico estricto de $256 \times 256\text{ px}$, garantizando que la generación asíncrona del PNG no cause desplazamiento acumulado de layout.
4. **Cero waterfalls artificiales:** Los formularios de contacto (`DemoRequestForm`) y localización (`TraceLocator`) residen directamente en la landing page listos para el usuario, sin retrasar su interactividad con loaders innecesarios.

---

## 4. Invariantes del Navegador y Supresión de Hidratación (`S22-21`, `D09`, `AUD-10`)

### Prohibición de `suppressHydrationWarning` en Contenido
El uso de `suppressHydrationWarning` para ocultar discrepancias de renderizado entre servidor y cliente está estrictamente vetado en todos los componentes de contenido (`src/components/`).
- **Única excepción justificada (`D09`):** La etiqueta `<html ... suppressHydrationWarning>` en `src/app/layout.tsx` y `src/app/global-error.tsx`. Esta directiva es obligatoria por diseño de React debido a que el script síncrono `THEME_BOOTSTRAP` inserta el atributo `data-theme` en `document.documentElement` antes del montaje inicial para evitar el destello en blanco en modo oscuro.

### Pruebas de Entorno del Navegador
1. **Temas:** Soporte completo para apariencias clara, oscura y de sistema, con persistencia en `localStorage` y coherencia de `color-scheme` nativo.
2. **Diseño responsivo:** Verificado en anchos móviles (360px, 390px) y escritorio (768px, 1024px, 1440px) asegurando `document.documentElement.scrollWidth <= innerWidth + 1` (sin desbordamiento horizontal).
3. **Navegación por teclado:** Enlace de salto inicial (`.skip-link`) enfocado al presionar Tab, llevando el foco directamente al contenedor principal `<main id="contenido" tabIndex={-1}>`.
4. **CSP Estricta:** Ejecución bajo política sin `unsafe-inline` para scripts, autorizando el tema mediante el digest criptográfico `THEME_BOOTSTRAP_HASH`.

---

## 5. Metas de Laboratorio Core Web Vitals (`S22-22`, `D12`)

El gate de laboratorio ejecuta tres corridas independientes del mismo build de producción con emulación móvil de Lighthouse (estrangulamiento simulado):

| Métrica | Objetivo de Laboratorio S22 | Mediana Obtenida (Landing) | Evaluación |
| :--- | :--- | :--- | :--- |
| **LCP** (Largest Contentful Paint) | $\le 2500\text{ ms}$ (2,5 s) | **938.25 ms** | **APROBADO** |
| **CLS** (Cumulative Layout Shift) | $\le 0.10$ | **0.000** | **APROBADO** |
| **TBT** (Total Blocking Time) | $\le 250\text{ ms}$ | **235.44 ms** | **APROBADO** |

### Reglas de Laboratorio:
1. **Mediana de 3 corridas:** Ninguna corrida aislada define el veredicto; se toma la mediana estadística.
2. **TBT es diagnóstico de laboratorio:** Total Blocking Time evalúa la ocupación del hilo principal en laboratorio. **Bajo ninguna circunstancia se presenta TBT como sustituto de INP de campo** (`inpIsLaboratoryTbt: false`).
3. **Comparación con base equivalente:** Una nueva versión no puede empeorar más de un 20% la mediana de una base comparable anterior (salvo que la métrica esté ampliamente holgada).

---

## 6. Comandos Operativos y Automatización

```bash
# Ejecutar el gate de presupuestos de frontend e integridad de recursos
npm run frontend:gate

# Ejecutar el gate con salida estructurada JSON
npm run frontend:gate -- --json

# Ejecutar la suite de pruebas automatizadas de UI y presupuestos
npm run test:ui:tokens

# Ejecutar las 3 corridas de laboratorio Lighthouse contra un servidor activo
npm run frontend:lab -- --url http://127.0.0.1:3000
```

### Bloqueo Automático
El gate (`scripts/frontend-gate.ts` y `tests/ui/frontend-budgets.test.ts`) finaliza con código de error 1 y aborta la integración si:
- Cualquier ruta supera su presupuesto de JavaScript comprimido.
- Cualquier métrica de laboratorio supera el umbral establecido.
- Se detecta un `suppressHydrationWarning` no autorizado.
- Falta la prioridad de imagen crítica o la reserva geométrica del QR.
