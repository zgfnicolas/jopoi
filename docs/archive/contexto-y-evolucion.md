# Contexto y evolución de Jopói

Fecha: 2026-10-22. Este análisis separa pedidos del usuario, propuestas históricas y requisitos actuales. No acredita validación comercial ni implementación.

## Fuentes y prioridad

1. El pedido actual define una demo web con Next.js, SQL, Prisma, Hedera testnet, sección «Book a demo» y hosting en Vercel. NoSQL aparece como posibilidad.
2. [JOPOI.md](../JOPOI.md) conserva la conversación histórica. Sus respuestas no equivalen automáticamente a decisiones aprobadas.
3. [Plan de negocios](jopoi_plan_de_negocios.md) es un informe de prefactibilidad: distingue evidencia secundaria, inferencias y supuestos. Sus recomendaciones no reemplazan el pedido actual.

No se modifican las fuentes históricas. Las referencias de líneas corresponden a su estado al elaborar este análisis. Este documento analiza las fuentes locales; no revalida sus cifras de mercado ni sus conclusiones normativas.

## Evolución

| Etapa | Evidencia | Lectura para el proyecto actual |
| --- | --- | --- |
| Simbiosis B2B regional | JOPOI.md:5 | Conectar generadores, compradores y transportistas, aprovechando retornos y control humano. |
| Identidad y lenguaje | JOPOI.md:219, 311 | Jopói elegido por el usuario; comunicación simple y coloquial. |
| Logística integrada | JOPOI.md:581, 672 | Se exploran API y GPS; no hay proveedor ni integración concreta acordada. |
| Custodia física | JOPOI.md:723–907 | Preferencia por QR y offline; aprobación de precintos preimpresos y del modelo híbrido de recipientes propuesto inmediatamente antes. |
| Trazabilidad verificable | JOPOI.md:951, 1014, 1145 | Interés por blockchain y desarrollo de Hedera; custodia de claves y alcance offline todavía requieren definición. |
| Revisión crítica | JOPOI.md:1367–1456 | Se corrigen promesas de fraude cero, métricas ambientales automáticas y rentabilidad sin validar. |
| Foco industrial | JOPOI.md:1464–1482, 1770–1800; plan:64–78 | Se recomienda abastecimiento forestal y un corredor acotado. Es recomendación, pendiente de ratificación para la demo. |
| Pedido actual | Conversación del 2026-10-22 | Demo técnica con Hedera testnet real, aunque el plan comercial proponía postergar blockchain. |

## Tensiones que el alcance debe resolver

- **Mercado inicial:** hoteles/Iberá y múltiples sectores en la idea original frente a chips forestales como foco recomendado al cierre.
- **Madurez:** una demo funcional puede mostrar el producto sin demostrar demanda, contratos, ahorros ni rentabilidad comercial.
- **Trazabilidad:** registrar un evento permite contrastar lo registrado; no demuestra por sí mismo peso, composición o entrega física.
- **Custodia:** las preferencias históricas por QR, precintos y offline no determinan cuánto debe implementarse en esta primera entrega.
- **Infraestructura física:** representar un precinto de prueba no compromete la compra ni distribución de recipientes.
- **Ingresos:** comisiones, suscripción y tarifa por despacho son alternativas históricas; el cobro real no está aprobado como requisito de la demo.
- **Ambiente:** reportes de trazabilidad y métricas ilustrativas no equivalen a créditos ambientales certificados.
- **Clasificación del material:** los documentos históricos corrigen la idea de que un nombre o remito cambie automáticamente su condición jurídica. La demo no acreditará esa condición.

## Estado del repositorio

Al iniciar esta sesión existen documentos y skills; no hay aplicación Next.js ni package.json. No hay evidencia local de despliegue, base de datos configurada, cuenta Hedera operativa, contratos o entrevistas propias verificadas.

El siguiente paso es cerrar [alcance y límites de la demo](alcance-demo.md). Las decisiones técnicas o de dominio con compromisos relevantes se registrarán como ADR cuando exista una elección acordada y un motivo concreto.

## Confirmación posterior: ronda 1

El usuario aceptó orientar la demo a explicar el beneficio principal a compradores industriales y posibles aliados, con un solo material en el escenario forestal propuesto. Confirmó datos separados por sesión, acciones persistidas y envío real a Hedera testnet; también los dos accesos «Probar demo» y «Book a demo», y mantener operación, QR y trazabilidad como núcleo. La sincronización offline completa y las integraciones avanzadas quedan para evolución; se acepta no contratar servicios pagos hasta definir infraestructura y costos. Esta confirmación no cierra los detalles del modelo operativo ni de la arquitectura.

## Cierre de decisiones: rondas 2–5

Q7–Q25 definieron una operación de lote completo con comprador y viaje únicos, roles simulados por sesión anónima, QR de consulta, evidencia precargada, estados con rechazo o incidencia, PostgreSQL/Prisma/JSONB, HCS firmado por Jopói, hashes verificables, persistencia previa al envío, reintentos acotados, cuotas y retención. El usuario rechazó prever Pro en Q26 y fijó presupuesto estrictamente cero y Vercel Free.

Q27–Q30 resolvieron el ajuste: prototipo personal con formulario real para conocerlo, lanzamiento comercial posterior, Neon Free y barrido automático diario en lugar de revisión horaria. También se aceptaron validaciones de cantidad/humedad, bloqueo de transporte incompatible y diferencia de peso como incidencia con tolerancia cero únicamente para la demo.

Las decisiones de alcance quedaron confirmadas globalmente en Q31. El usuario aclaró posteriormente que el siguiente paso es preparar las specs y que todavía no debe escribirse código; la preparación técnica iniciada por error se detuvo. El [documento vigente](alcance-demo.md) recoge esa fase. Los requisitos anteriores sobre Pro y revisión horaria no forman parte de la entrega actual. La aplicación y los servicios todavía no están implementados ni desplegados.
