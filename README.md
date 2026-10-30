# Jopói

Prototipo personal de coordinación B2B de subproductos y transporte en Corrientes. La demo usa chips forestales y datos ficticios, con registros reales en Hedera testnet.

La definición del proyecto quedó confirmada en Q31 y las 18 specs originales y S19 están documentadas. S01–S11 implementan backend y coordinación HCS; S12–S15 incorporan interfaz, contacto, panel y trazabilidad/QR. S16 prepara la entrega con validación offline, entorno explícito, observación privada y guía de publicación/recuperación. S17 incorpora pruebas HTTP con PostgreSQL aislado y Hedera controlado. S18 añade recorridos de navegador en Chromium y WebKit móvil emulado, evidencia y aceptación separada del candidato publicado. Las cuatro migraciones están aplicadas y comprobadas en PostgreSQL local. Despliegue, planes gratuitos y cinco hitos reales de testnet requieren configuración y evidencia externas; no se declaran aprobados por pasar pruebas locales.

## Documentación

| Documento | Contenido |
| --- | --- |
| [Alcance de la demo](docs/alcance-demo.md) | Fuente vigente: objetivo, límites, reglas, presupuesto y criterios de aceptación. |
| [Specs ordenadas](docs/specs/README.md) | 18 specs originales y S19 para persistencia gestionada desde Vercel. |
| [Seguridad y datos S21](docs/s21-validacion.md) | Límites compartidos, sesiones, TLS/UTC, auditoría SQL, integridad, recuperación y evidencia local/remota separada. |
| [Configuración y entorno](docs/configuracion-y-entorno.md) | Base S01, inventario privado, versiones, contratos y estado de los comandos. |
| [Escenario y cálculo](docs/escenario-y-calculo.md) | Base S02, snapshots, precisión, fórmula, recursos y atribuciones. |
| [Persistencia SQL](docs/persistencia-sql.md) | Base S03, PostgreSQL portable, modelo, migraciones, transacciones y retención. |
| [Sesiones y aislamiento](docs/sesiones-y-aislamiento.md) | S04, preparación local, contratos HTTP, cookies, idempotencia y cuota por sesión. |
| [Contactos y exportación](docs/contactos-y-exportacion.md) | S05, API de solicitudes, retención e instrucciones privadas de CSV para Excel. |
| [Reglas de operación](docs/reglas-de-operacion.md) | S06, máquina de estados, roles, motivos y compatibilidad explicada de viajes. |
| [Eventos y hashes](docs/eventos-y-hashes.md) | S07, payload público, JCS/SHA-256, idempotencia y ejecución transaccional privada. |
| [API del recorrido](docs/api-del-recorrido.md) | S08, recuperación privada, historial, comandos HTTP y estados SQL/red separados. |
| [Hedera testnet](docs/hedera-testnet.md) | S09, firma/persistencia, receipt/mirror, generación fija y CLI administrativo. |
| [Cuotas, reintentos y mantenimiento](docs/cuotas-reintentos-y-mantenimiento.md) | S10, coordinación durable, 3+1 intentos, cron diario y limpieza acotada. |
| [API pública de trazabilidad](docs/api-publica-de-trazabilidad.md) | S11, historial sin sesión, integridad, contraste remoto transitorio y caducidad. |
| [Base del frontend](docs/base-del-frontend.md) | S12, superficies mínimas, componentes accesibles, lecturas y estados compartidos. |
| [Landing y solicitud de demo](docs/landing-y-solicitud-de-demo.md) | S13, escenario, formulario real, reintento idempotente y revisión visual pendiente. |
| [Panel operativo guiado](docs/panel-operativo-guiado.md) | S14, inicio explícito, roles, tres ramas, intenciones y publicación separada de SQL. |
| [Trazabilidad pública y QR](docs/trazabilidad-publica-y-qr.md) | S15, detalle, contraste explícito, origen configurado y QR compartido. |
| [Preparación del despliegue gratuito](docs/despliegue-gratuito.md) | S16, comandos offline, selección de entorno, operación y publicación futura sin gasto. |
| [Pruebas de API e integración](docs/pruebas-api-e-integracion.md) | S17, ejecución aislada, matriz API-01–API-26 y evidencia con red controlada. |
| [Pruebas E2E y aceptación](docs/pruebas-e2e-y-aceptacion.md) | S18, navegador, QR, teclado/móvil, informes y aceptación externa con bloqueos explícitos. |
| [Persistencia gestionada desde Vercel](docs/persistencia-gestionada-desde-vercel.md) | S19, integración nativa del Marketplace, exportación privada de entorno y evidencia v2 del proyecto y la base vinculados. |
| [Sistema de diseño](DESIGN.md) | Ficha de abastecimiento industrial, tokens y componentes compartidos. |
| [Modelo de la demo](docs/modelo-demo.md) | Participantes, relaciones y estados. |
| [Flujo y trazabilidad](docs/flujo-y-trazabilidad.md) | Hitos HCS, hashes, pendientes, cuotas y recuperación. |
| [Infraestructura](docs/infraestructura-demo.md) | Vercel Hobby, Neon Free, testnet, tareas diarias y fuentes oficiales. |
| [Viabilidad técnica](docs/viabilidad-tecnica-demo.md) | Hechos técnicos que sustentan la arquitectura. |
| [Glosario](GLOSSARY.md) | Vocabulario de dominio. |
| [Contexto y evolución](docs/contexto-y-evolucion.md) | Recorrido histórico y decisiones de las cinco rondas. |

## Base acordada

Next.js, PostgreSQL con Prisma y JSONB mediante Neon nativo de Vercel Marketplace, Vercel Free/Hobby y Hedera HCS testnet firmado por el servidor Jopói. La preparación habitual de la base se gestiona desde Vercel, sin cuenta independiente en Neon. Presupuesto cero, sin tarjetas, planes pagos ni upgrades automáticos; condiciones en la cuenta y aceptación remota aún requieren evidencia real.

La experiencia representa generador, coordinador, transportista y comprador dentro de una sesión anónima. «Probar demo» abre el recorrido; «Book a demo» guarda una solicitud real para conocer el prototipo. El lanzamiento comercial queda para una evolución posterior.

## Decisiones registradas

- [ADR 0001: demo técnica separada del piloto comercial](docs/adr/0001-demo-tecnica-separada-del-piloto.md).
- [ADR 0002: firma de Jopói en HCS](docs/adr/0002-firma-de-jopoi-en-la-demo.md).
- [ADR 0003: presupuesto cero y Vercel Free](docs/adr/0003-presupuesto-cero-y-vercel-free.md).

## Fuentes históricas

[JOPOI.md](JOPOI.md) conserva la conversación de origen y [el plan de negocios](docs/jopoi_plan_de_negocios.md) la prefactibilidad comercial. Incluyen propuestas e hipótesis que no equivalen al alcance vigente ni a validación del negocio. El alcance actual prevalece ante diferencias.
