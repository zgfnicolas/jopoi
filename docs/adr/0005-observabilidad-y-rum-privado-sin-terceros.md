# 5. Observabilidad y RUM privado sin servicios externos de terceros

Fecha: 2026-11-14  
Estado: Aceptada  

## Contexto
Para cerrar la profesionalización operativa de Jopói (S22), se necesitan métricas de capacidad, percentiles reales de experiencia de usuario (Web Vitals: LCP, CLS, INP, TTFB), cálculo de error budgets / SLOs y detección proactiva de anomalías. Sin embargo, el principio rector del proyecto impone **presupuesto financiero cero** ($0) y máxima privacidad para los visitantes. Servicios habituales como Datadog, Sentry, New Relic o Vercel Web Analytics de pago quedan excluidos por costos y por recolección de telemetría de terceros.

## Opciones consideradas
1. Integrar servicios SaaS freemium (Sentry, Google Analytics o Mixpanel).
2. Omitir la observabilidad y depender únicamente de los logs efímeros de la consola de Vercel.
3. Implementar un colector de RUM privado y motor de SLOs propio en el servidor, utilizando balizas (`navigator.sendBeacon`) anónimas hacia un endpoint interno `/api/v1/rum`.

## Decisión
Implementamos una **arquitectura de observabilidad in-house y RUM privado**:
- Componente cliente [`RumCollector`](file:///C:/Users/Facundo/dev/jopoi/src/components/rum-collector.tsx) que mide métricas estandarizadas de Web Vitals y las despacha vía beacon anónimo sin cookies, IPs ni identificadores de dispositivo.
- Endpoint de ingestión [`/api/v1/rum`](file:///C:/Users/Facundo/dev/jopoi/src/app/api/v1/rum/route.ts) con almacenamiento de percentiles (p50, p75, p95) en memoria y buffer circular.
- Motor de evaluación de SLOs y alertas correlacionadas con runbooks operativos en [`docs/runbooks/`](file:///C:/Users/Facundo/dev/jopoi/docs/runbooks/).

## Motivos
- Cumple rigurosamente el presupuesto cero: costo marginal cero de almacenamiento y procesamiento.
- Privacidad total: ningún dato de telemetría o navegación de los visitantes sale del servidor de la aplicación hacia redes de publicidad o rastreo de terceros.
- Control total sobre los umbrales de alerta y budgets de error.

## Consecuencias
- (+) Soberanía completa de datos y cumplimiento con la Ley 25.326 de Protección de Datos Personales.
- (+) Disponibilidad de percentiles reales y salud operativa comprobable mediante pruebas automatizadas (`npm run test:observability`).
- (−) Retención en memoria efímera que se reinicia con el ciclo de vida de las funciones serverless de Vercel (mitigado con muestreo continuo y proyecciones periódicas).
