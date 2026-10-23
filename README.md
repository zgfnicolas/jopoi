# Jopói

Prototipo personal de coordinación B2B de subproductos y transporte en Corrientes. La demo usa chips forestales y datos ficticios, con registros reales en Hedera testnet.

La definición del proyecto quedó confirmada en Q31 y las 18 specs están documentadas. Las bases S01–S07 implementan configuración, escenario/cálculo, SQL, sesiones, contactos, reglas de dominio y eventos con persistencia atómica. Next.js compila los endpoints de sesión, inicio, reinicio y contacto; el CLI permite exportar contactos a CSV para Excel. S07 aporta ejecución transaccional privada, payloads públicos JCS y hashes SHA-256; S08 la expondrá mediante la API operativa. Todavía no hay interfaz, integración Hedera ni despliegue externo. Se conservan las dos migraciones de S03/S04; S07 añade únicamente canonicalize 5.1.0. Las pruebas de comportamiento quedan para S17/S18.

## Documentación

| Documento | Contenido |
| --- | --- |
| [Alcance de la demo](docs/alcance-demo.md) | Fuente vigente: objetivo, límites, reglas, presupuesto y criterios de aceptación. |
| [Specs ordenadas](docs/specs/README.md) | 18 specs desde backend hasta frontend y entrega, con pruebas al final. |
| [Configuración y entorno](docs/configuracion-y-entorno.md) | Base S01, inventario privado, versiones, contratos y estado de los comandos. |
| [Escenario y cálculo](docs/escenario-y-calculo.md) | Base S02, snapshots, precisión, fórmula, recursos y atribuciones. |
| [Persistencia SQL](docs/persistencia-sql.md) | Base S03, PostgreSQL portable, modelo, migraciones, transacciones y retención. |
| [Sesiones y aislamiento](docs/sesiones-y-aislamiento.md) | S04, preparación local, contratos HTTP, cookies, idempotencia y cuota por sesión. |
| [Contactos y exportación](docs/contactos-y-exportacion.md) | S05, API de solicitudes, retención e instrucciones privadas de CSV para Excel. |
| [Reglas de operación](docs/reglas-de-operacion.md) | S06, máquina de estados, roles, motivos y compatibilidad explicada de viajes. |
| [Eventos y hashes](docs/eventos-y-hashes.md) | S07, payload público, JCS/SHA-256, idempotencia y ejecución transaccional privada. |
| [Modelo de la demo](docs/modelo-demo.md) | Participantes, relaciones y estados. |
| [Flujo y trazabilidad](docs/flujo-y-trazabilidad.md) | Hitos HCS, hashes, pendientes, cuotas y recuperación. |
| [Infraestructura](docs/infraestructura-demo.md) | Vercel Hobby, Neon Free, testnet, tareas diarias y fuentes oficiales. |
| [Viabilidad técnica](docs/viabilidad-tecnica-demo.md) | Hechos técnicos que sustentan la arquitectura. |
| [Glosario](GLOSSARY.md) | Vocabulario de dominio. |
| [Contexto y evolución](docs/contexto-y-evolucion.md) | Recorrido histórico y decisiones de las cinco rondas. |

## Base acordada

Next.js, PostgreSQL en Neon Free con Prisma y JSONB, Vercel Free/Hobby y Hedera HCS testnet firmado por el servidor Jopói. Presupuesto cero, sin tarjetas, planes pagos ni upgrades automáticos.

La experiencia representa generador, coordinador, transportista y comprador dentro de una sesión anónima. «Probar demo» abre el recorrido; «Book a demo» guarda una solicitud real para conocer el prototipo. El lanzamiento comercial queda para una evolución posterior.

## Decisiones registradas

- [ADR 0001: demo técnica separada del piloto comercial](docs/adr/0001-demo-tecnica-separada-del-piloto.md).
- [ADR 0002: firma de Jopói en HCS](docs/adr/0002-firma-de-jopoi-en-la-demo.md).
- [ADR 0003: presupuesto cero y Vercel Free](docs/adr/0003-presupuesto-cero-y-vercel-free.md).

## Fuentes históricas

[JOPOI.md](JOPOI.md) conserva la conversación de origen y [el plan de negocios](docs/jopoi_plan_de_negocios.md) la prefactibilidad comercial. Incluyen propuestas e hipótesis que no equivalen al alcance vigente ni a validación del negocio. El alcance actual prevalece ante diferencias.
