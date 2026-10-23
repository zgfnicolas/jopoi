# Infraestructura de la demo Jopói

Estado: presupuesto cero y Vercel Free/Hobby exigidos en Q26; ajustes Q27–Q30 aceptados. Hechos verificados el 2026-10-22. No se han creado cuentas, contratado planes ni desplegado recursos.

## Presupuesto y finalidad de uso

El usuario indicó: «No, no pagaremos nada! Vercel en la capa Free!». Queda rechazada la propuesta de prever Pro. No se utilizarán tarjetas, cargos ni upgrades automáticos. La decisión está registrada en el [ADR 0003](adr/0003-presupuesto-cero-y-vercel-free.md).

Vercel limita Hobby al uso personal no comercial e incluye anunciar productos o servicios en su definición de uso comercial. La documentación se actualizó el 2026-09-14. Fuente: [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

La política no clasifica expresamente «Book a demo», formularios de contacto ni prototipos como categorías de uso. Por tanto, la conclusión anterior de que la presencia de ese formulario obliga a prever Pro era demasiado categórica. La finalidad sí importa: un experimento personal para mostrar y recibir comentarios difiere de anunciar servicios y captar clientes.

**Acuerdo Q27:** esta entrega es un prototipo personal para mostrar el concepto y recibir comentarios. «Book a demo» conserva un formulario real para solicitar conocer el prototipo. El lanzamiento comercial queda para una evolución posterior. Ese acuerdo fija la finalidad de esta entrega; no constituye una aprobación emitida por Vercel ni una garantía de elegibilidad para usos comerciales futuros.

Vercel Free/Hobby sigue siendo el destino solicitado. No se sustituye por un plan pago ni otro proveedor. La entrega debe ajustarse a esa restricción explícita.

## PostgreSQL: Neon Free elegido

La oferta consultada de Neon Free es USD 0, sin tarjeta, con 1 GB de almacenamiento por proyecto, 100 CU-h de cómputo al mes por proyecto y 5 GB de transferencia pública al mes por proyecto. La base se suspende tras cinco minutos de inactividad; no tiene SLA y puede suspenderse al agotar cómputo o transferencia. Fuentes: [planes Neon](https://neon.com/docs/introduction/plans) y [precios Neon](https://neon.com/pricing).

Q29 eligió Neon Free, sin tarjeta ni upgrades automáticos, con datos acotados y aceptación de pausas y límites. Esto no garantiza que cualquier volumen de uso entre en la capa gratuita: se controlará con cuotas y se mostrará indisponibilidad real si el servicio se suspende. Se conserva el gasto cero. No existe una base Neon provisionada; S03 preparó PostgreSQL portable exclusivamente para desarrollo local.

La guía oficial indica conexión pooled para la aplicación y conexión directa para Prisma CLI/migraciones. Las versiones compatibles y el adaptador se fijarán al implementar. Fuente: [Prisma y Neon](https://neon.com/docs/guides/prisma).

## Limpieza y reconciliación

Vercel Cron invoca Functions, no mantiene un proceso permanente. Hobby permite frecuencia diaria; Pro admite frecuencia por minuto. Las funciones invocadas consumen recursos según el plan. Fuente: [uso y precios de Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Las invocaciones pueden perderse, repetirse o solaparse; no hay reintento automático de una ejecución fallida. Vercel recomienda idempotencia y bloqueo, y permite proteger el endpoint mediante `CRON_SECRET`. Fuente: [gestión de Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

Q22/Q25 aceptaron pendientes persistidos, reintentos acotados y limpieza diaria. Q28 sustituyó expresamente la revisión horaria original, incompatible con Cron Hobby. No se simulará esa frecuencia multiplicando tareas diarias.

**Acuerdo Q28:** reconciliación durante la interacción, reintento manual y un barrido automático diario junto con limpieza. Los trabajos procesarán lotes acotados con exclusión de concurrencia. En local podrán ejecutarse mediante comandos documentados. No se añade un programador externo.

Una alternativa técnica gratuita sería GitHub Actions programado, pero añade otra dependencia y no garantiza la ejecución puntual: puede retrasarse o descartarse; su uso depende de cuotas y tipo de repositorio. No está elegido. Fuentes: [eventos programados de Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) y [facturación de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

**Inferencia sobre consumo:** consultar Neon cada minuto impediría su suspensión por inactividad. A 0,25 CU constantes durante 30 días, el consumo sería aproximadamente 180 CU-h, por encima de 100 CU-h. Por eso no se propone polling permanente por minuto.

Q25 confirmó distinguir vencimiento de acceso y borrado físico en la siguiente ejecución diaria exitosa. Los registros enviados a testnet no se eliminan al limpiar PostgreSQL, aunque la red testnet puede reiniciarse según sus propias condiciones.

## HCS con saldo de prueba

Hedera testnet usa HBAR de prueba gratuitos. Las transacciones HCS consumen ese saldo ficticio; no requieren comprar HBAR reales para esta demo. Se contempla saldo agotado y disponibilidad del faucet, sin autorizar recargas pagas. Fuentes: [redes y ciclo de lanzamiento de Hedera](https://hedera.com/blog/hedera-release-cycle-overview/) y [crear y financiar una cuenta de prueba](https://docs.hedera.com/native/tutorials/getting-started/create-fund-account).

## Estado de autorización

- Acordado: prototipo personal, presupuesto cero, Vercel Free/Hobby, Neon Free con Prisma, HCS testnet, cuotas y política de vencimiento con barrido y limpieza diarios.
- Rechazado: prever Pro para la publicación. No hay autorización para pagar.
- Definición de infraestructura resuelta y alcance confirmado en Q31. Después de preparar las specs, el usuario autorizó implementar S01–S08; la base local, sesiones, contactos y reglas ya tienen ejecución privada transaccional con eventos/hashes y API operativa, sin recursos externos nuevos. Ver [persistencia SQL](persistencia-sql.md), [sesiones y aislamiento](sesiones-y-aislamiento.md), [contactos y exportación](contactos-y-exportacion.md), [reglas de operación](reglas-de-operacion.md), [eventos y hashes](eventos-y-hashes.md) y [API del recorrido](api-del-recorrido.md).
- S09 añade [código del adaptador y CLI de testnet](hedera-testnet.md), sin crear recursos externos ni enviar transacciones. S10 conecta [cuotas, leases, disparadores y mantenimiento diario](cuotas-reintentos-y-mantenimiento.md), con una única entrada Cron en `vercel.json`. Las cuatro migraciones están aplicadas localmente; cron y limpieza todavía no se ejecutaron ni desplegaron. No se declara una integración real comprobada antes de S18.
- Sin realizar: alta de servicios externos, creación de base Neon, creación de topic HCS, configuración de secretos externos y despliegue.
