# Specs de la demo Jopói

Fecha: 2026-10-22. Base: alcance confirmado en Q31 y aclaración posterior de trabajar en specs antes de escribir código.

Estado: 18 specs documentadas; S01–S11 implementadas como bases de configuración, escenario/cálculo, SQL, sesiones, contactos, reglas, eventos/transacción, API privada, adaptador HCS, coordinación durable y consulta pública por instrucciones posteriores del usuario. Las cuatro migraciones están aplicadas a PostgreSQL local; S12–S18 siguen sin implementar. El usuario confirmó API pública más navegador como límites de prueba. S02–S10 se integraron mediante PR #1–#9; este trabajo no publica nuevas issues ni PRs.

## Orden de trabajo

La progresión va de piezas pequeñas de base al backend compuesto, después al frontend y la entrega integrada. Los tamaños XS, S, M, L y XL son relativos dentro de cada capa, sin estimaciones de horas. Las dependencias tienen prioridad sobre el tamaño. Las dos specs que crean y ejecutan tests están al final.

| Orden | Spec | Capa | Tamaño | Depende de |
| --- | --- | --- | --- | --- |
| S01 | [Configuración, entorno y presupuesto cero](01-configuracion-y-entorno.md) | Backend · base | XS | Ninguna |
| S02 | [Escenario precargado y explicación económica](02-escenario-y-calculo.md) | Backend · datos de ejemplo | S | S01 |
| S03 | [Persistencia relacional, precisión y migraciones](03-persistencia-sql.md) | Backend · datos persistentes | S | S01, S02 |
| S04 | [Sesiones anónimas, propiedad y límite de recorridos](04-sesiones-y-aislamiento.md) | Backend · acceso | S | S03 |
| S05 | [Solicitud real de demo y exportación privada](05-contactos-y-exportacion.md) | Backend · contacto | S | S01, S03 |
| S06 | [Reglas de operación, estados y compatibilidad](06-reglas-de-operacion.md) | Backend · dominio | M | S02, S03, S04 |
| S07 | [Eventos inmutables, hash y pendiente transaccional](07-eventos-y-hashes.md) | Backend · trazabilidad local | M | S03, S06 |
| S08 | [API privada del recorrido y comandos idempotentes](08-api-del-recorrido.md) | Backend · interfaz operativa | M | S04, S06, S07 |
| S09 | [Adaptador HCS real y verificación en testnet](09-hedera-testnet.md) | Backend · integración externa | L | S01, S07 |
| S10 | [Cuotas, recuperación y mantenimiento diario](10-cuotas-reintentos-y-mantenimiento.md) | Backend · coordinación durable | L | S03, S04, S05, S07, S08, S09 |
| S11 | [API pública de trazabilidad y verificación](11-api-publica-de-trazabilidad.md) | Backend · consulta pública integrada | L | S07, S09, S10 |
| S12 | [Base del frontend, navegación y estados compartidos](12-base-del-frontend.md) | Frontend · base | S | S01, S08, S11 |
| S13 | [Landing del prototipo y formulario Book a demo](13-landing-y-solicitud-de-demo.md) | Frontend · entrada al producto | M | S02, S05, S12 |
| S14 | [Panel guiado del recorrido completo](14-panel-operativo-guiado.md) | Frontend · operación integrada | L | S04, S06, S08, S10, S12 |
| S15 | [Página pública de trazabilidad y QR](15-trazabilidad-publica-y-qr.md) | Frontend · lectura verificable | L | S11, S12, S14 |
| S16 | [Preparación de entrega, despliegue gratuito y operación](16-despliegue-gratuito.md) | Entrega · integración de backend y frontend | L | S01–S15 |
| S17 | [Pruebas de API pública e integración](17-pruebas-de-api-e-integracion.md) | Pruebas · backend integrado | L | S01–S11, S16 |
| S18 | [Pruebas de navegador y aceptación final](18-pruebas-e2e-y-aceptacion.md) | Pruebas · sistema completo | XL | S12–S17 |

S01–S05 preparan capacidades acotadas; S06–S11 integran las reglas y la trazabilidad de backend; S12–S15 construyen la experiencia; S16 prepara la entrega gratuita; S17–S18 crean y ejecutan las verificaciones finales.

Cada documento conserva Testing Decisions porque lo exige la plantilla de to-spec. En S01–S16 ese apartado remite a la etapa final; no autoriza escribir tests antes ni implementar código durante esta fase documental.

## Estado real y precedencia

- El repositorio conserva la documentación de alcance y las bases S01–S11. Hay cuatro migraciones aplicadas a PostgreSQL local, API privada y pública de trazabilidad, reintento privado y cron diario, CLI administrativos, eventos/hashes, adaptador HCS y coordinación durable; todavía no hay interfaz, comprobación real de testnet o despliegue terminado.
- S01 incorpora configuración privada, políticas y errores compartidos; su [documentación de entorno](../configuracion-y-entorno.md) distingue lo implementado de las conexiones y funcionalidades pendientes. Su cierre incluye comprobación TypeScript y revisión estática; las suites siguen reservadas a S17 y S18.
- S02 incorpora `chips-v1`, snapshots independientes, cálculo exacto y recursos locales con atribución. Su [documentación de escenario](../escenario-y-calculo.md) registra contratos y verificaciones de tipos/recursos, sin adelantar persistencia, reglas de asignación ni suites.
- S03 incorpora esquema, migración y acceso SQL. Su [documentación de persistencia](../persistencia-sql.md) registra PostgreSQL portable y comprobación de conexión, sin adelantar servicios HTTP, HCS ni suites.
- S04 incorpora sesiones, guardas privadas, recibos de intención y endpoints de inicio/recuperación/reinicio. Su [documentación](../sesiones-y-aislamiento.md) distingue compilación y migración comprobadas de las verificaciones de comportamiento pendientes de S17/S18.
- S05 incorpora API de contacto y CSV privado para Excel, sin nuevas migraciones ni dependencias. Su [documentación](../contactos-y-exportacion.md) registra contratos, límites y verificaciones de tipos/build/ayuda CLI; comportamiento pendiente de S17/S18.
- S06 incorpora decisiones puras de operación y compatibilidad explicada, sin rutas nuevas ni escrituras SQL. Su [documentación](../reglas-de-operacion.md) distingue dominio implementado de integración S07/S08 y pruebas S17/S18 pendientes.
- S07 incorpora formatos públicos v1, JCS/SHA-256 y ejecución privada con recibo/estado/evento/pendiente en una transacción. Su [documentación](../eventos-y-hashes.md) registra contratos y comprobaciones de preparación; comportamiento pendiente de S17/S18.
- S08 conecta lecturas privadas y comandos HTTP a esas bases, recuperando snapshot, economía, compatibilidad e historial. Su [documentación](../api-del-recorrido.md) fija contratos y preparación; pruebas de comportamiento pendientes de S17/S18, sin envío de red.
- S09 añade [adaptador y CLI HCS testnet](../hedera-testnet.md), namespace SDK oficial, vinculación por recorrido y evidencia de verificación. Su migración está aplicada y comprobada localmente; no se ha creado topic ni comprobado testnet.
- S10 conecta [cuotas, reintentos y mantenimiento diario](../cuotas-reintentos-y-mantenimiento.md): historial de intentos, leases, 3+1 envíos, activación posterior a SQL, API privada de reintento y cron/CLI compartidos con limpieza acotada. Migración local, tipos, Prisma, ayuda y build comprobados; comportamiento y red pendientes de S17/S18.
- S11 añade [API pública de trazabilidad](../api-publica-de-trazabilidad.md): contexto ficticio mínimo para borradores, historial sin cookie, integridad por hito, evidencia histórica y contraste remoto transitorio sin escrituras. Tipos, Prisma y build comprobados; sin nuevas migraciones ni comprobación real de red. Página y QR corresponden a S15.
- La fuente de requisitos es el alcance confirmado, su glosario y sus ADR. Bocetos exploratorios, dependencias instaladas y el código intentado antes de la aclaración no son requisitos aprobados.
- Estas specs detallan contratos técnicos para revisión. Las elecciones nuevas —por ejemplo, rutas HTTP, precisión decimal, semilla v1, canonicalización y límite manual de reintento— se presentan como propuestas de implementación, sin reabrir el producto.
- Los documentos describen interfaces HTTP y comportamiento. La estructura de archivos, los snippets y la implementación quedan para otra fase.
- No se instala, programa, despliega, crea una cuenta, envía contacto ni consume testnet para producir esta documentación.

## Invariantes compartidas

1. Presupuesto cero: Vercel Hobby, Neon Free y HCS testnet con saldo ficticio; sin tarjetas, planes pagos ni upgrades automáticos.
2. Prototipo personal para mostrar y recibir comentarios; Book a demo solicita conocerlo. Lanzamiento comercial posterior.
3. Un material, un lote completo, un comprador y un viaje; sin fraccionamiento ni consolidación.
4. Sesión anónima privada de 24 horas; tres recorridos, incluido el inicial; cambio de rol simulado sin firmas independientes.
5. Guardar SQL antes del envío y conservar un pendiente durable. Nunca confundir acción local, confirmación de red y contraste de hash.
6. Publicación de cinco hitos por camino exitoso; borrador, navegación y consulta QR no generan transacciones.
7. Máximo global inicial de 100 envíos HCS diarios, trabajo acotado e idempotente durante interacción, manual y barrido diario; sin revisión horaria.
8. QR público de solo lectura, sin secretos ni permiso de mutación.
9. Retención operativa siete días y contactos 90 días; vencimiento de acceso y borrado en la siguiente ejecución diaria exitosa.
10. Reglas de cantidad, humedad, compatibilidad y peso acordadas en Q30. Tolerancia cero de peso solo para explicar la demo.
11. Evidencia y economía ficticias claramente identificadas; sin clientes, entregas físicas, rentabilidad o créditos ambientales inventados.

## Fronteras de prueba confirmadas

El usuario aceptó API pública más navegador en el checkpoint de to-spec.

- Principal: API de la aplicación. Cubre reglas, persistencia observable, aislamiento, concurrencia, cuotas y estados de Hedera. Usa SQL de prueba y sustituye solo fronteras externas cuando se necesitan resultados deterministas. No cubre diseño ni navegación.
- Complementaria: recorridos en navegador. Cubre formularios, QR, comprensión de estados, teclado y uso móvil. No repite cada combinación de validación de API.
- La comprobación controlada de HCS real se documenta separadamente dentro de S18; no se satisface con un proveedor simulado.
- No se prueban funciones privadas. El repositorio no tiene suite funcional previa. Las suites se crean y ejecutan únicamente en S17 y S18, después de las specs de implementación.

## Trazabilidad con los criterios del alcance

| Criterio de aceptación del alcance | Specs que lo desarrollan | Verificación final |
| --- | --- | --- |
| 1. URL Hobby, landing y móvil | S12, S13, S16 | S18 |
| 2. Conformidad, rechazo e incidencia | S06, S08, S14 | S17, S18 |
| 3. Validaciones y transporte compatible | S02, S06, S08 | S17 |
| 4. Aislamiento y concurrencia | S03, S04, S08 | S17, S18 |
| 5. QR público sin escritura ni secretos | S11, S15 | S17, S18 |
| 6. Cinco hitos reales contrastables | S07, S09, S10 | S17, S18 real |
| 7. Estados honestos y SQL previo | S07, S08, S09, S10 | S17, S18 |
| 8. Recorridos, cuota y retención | S03, S04, S10 | S17, S18 |
| 9. Barrido protegido diario | S10, S16 | S17, S18 |
| 10. Contacto real y CSV privado | S05, S13 | S17, S18 |
| 11. Contenido ficticio identificado | S02, S12, S13, S14, S15 | S18 |
| 12. Recursos gratuitos e indisponibilidad | S01, S10, S16 | S17, S18 |
| 13. Preparación y recuperación reproducibles | S01, S09, S16 | S18 |
| 14. Credenciales privadas | S01, S03, S09, S11, S16 | S17, S18 |

## Publicación en issue tracker

La skill to-spec pide publicar y aplicar ready-for-agent. No se configura ni se inventa un repositorio remoto para hacerlo: la revisión encontró este proyecto solo local y sin configuración de tracker.

Las specs permanecen completas en este directorio. La etiqueta indicada en cada documento es la etiqueta prevista para cuando se publiquen, no una etiqueta aplicada.

Para configurar el destino, ejecutar /setup-matt-pocock-skills. Después podrá publicarse una issue por spec, respetando orden, dependencias, contenido y etiqueta. No se envió ninguna comunicación ni se creó ninguna issue durante esta tarea.

## Fuentes revisadas

- [Alcance vigente](../alcance-demo.md).
- [Glosario](../../GLOSSARY.md).
- [Modelo de la demo](../modelo-demo.md).
- [Flujo y trazabilidad](../flujo-y-trazabilidad.md).
- [Infraestructura](../infraestructura-demo.md).
- [Viabilidad técnica](../viabilidad-tecnica-demo.md).
- [Contexto y evolución](../contexto-y-evolucion.md).
- [ADR 0001](../adr/0001-demo-tecnica-separada-del-piloto.md), [ADR 0002](../adr/0002-firma-de-jopoi-en-la-demo.md) y [ADR 0003](../adr/0003-presupuesto-cero-y-vercel-free.md).
- [Registro histórico JOPOI](../../JOPOI.md) y [prefactibilidad comercial](../jopoi_plan_de_negocios.md), subordinados a las decisiones actuales.
- Conversación completa de definición y corrección: Q1–Q31, presupuesto cero, barrido diario, fase documental y orden de pruebas al final.
