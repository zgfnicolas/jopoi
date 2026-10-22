# Viabilidad técnica de la demo

Revisión: 2026-10-22. Fuentes oficiales consultadas durante la sesión. Este documento reúne sustento técnico; las decisiones vigentes están en el [alcance](alcance-demo.md).

## Base técnica acordada

La base acordada es Next.js en Vercel Hobby, PostgreSQL en Neon Free con Prisma y Hedera testnet mediante HCS. El servidor Jopói firma los registros y JSONB cubre metadatos flexibles, sin segunda base NoSQL. Q20–Q25 confirmaron eventos, verificación, pendientes persistidos, reintentos, cuotas y retención; Q27–Q30 cerraron finalidad personal, barrido diario, proveedor gratuito y validaciones. El presupuesto es cero. Las condiciones se detallan en [infraestructura de la demo](infraestructura-demo.md). La evidencia será precargada y ficticia, sin subida de archivos por visitantes.

| Hecho verificado | Consecuencia para la arquitectura acordada |
| --- | --- |
| HCS ordena mensajes y les asigna timestamps de consenso. | Mostrar evidencia de lo registrado. Que esto no pruebe la verdad física es una inferencia del alcance del servicio. |
| Testnet puede reiniciarse y perder historial y configuración. | Tener un procedimiento para recrear recursos y datos de demo; registrar la red y evitar prometer permanencia del historial en testnet. |
| Prisma mapea `Json` a `jsonb` por defecto en PostgreSQL. | Usar PostgreSQL y JSONB con Prisma; no añadir una segunda base NoSQL en esta entrega. |
| Vercel Functions tiene filesystem de solo lectura, espacio temporal y duración de ejecución limitada. | Persistir datos y archivos en servicios externos; no depender de archivos locales ni de un proceso residente. |
| Las funciones pueden escalar a cero. | Persistir pendientes en SQL y procesarlos en ejecuciones acotadas durante la interacción, manualmente y mediante barrido diario con Cron. |
| El receipt y la lectura de mensajes mediante mirror node son pasos distintos. | Separar envío, confirmación y disponibilidad para verificación. |
| Un timeout de consulta no demuestra que una transacción haya fallado. | Guardar identificadores de evento y transacción; reconciliar antes de repetir un envío. |

Las decisiones funcionales aceptadas se registran en alcance y en [flujo y trazabilidad](flujo-y-trazabilidad.md). No se afirma atomicidad ni procesamiento exactamente una vez entre SQL y Hedera. La implementación debe probar el tratamiento de reintentos y resultados inciertos según esos acuerdos.

## Fuentes

- [Hedera Consensus Service](https://hedera.com/service/consensus-service/): alcance del servicio de consenso.
- [Hedera testnet](https://docs.hedera.com/networks/testnet): condiciones de testnet y resets.
- [Prisma Schema API: Json](https://docs.prisma.io/docs/orm/reference/prisma-schema-reference#json): representación de JSON según el motor.
- [Vercel Function runtimes](https://vercel.com/docs/functions/runtimes): entorno y restricciones de ejecución.
- [Vercel Functions](https://vercel.com/docs/functions): modelo de ejecución y escalado.
- [Hedera: submit a message](https://docs.hedera.com/native/consensus/submit-message): mensajes, receipt y consulta por mirror node.
- [Hedera: transaction receipt](https://docs.hedera.com/native/transactions/receipt): consulta por identificador y duplicados.
