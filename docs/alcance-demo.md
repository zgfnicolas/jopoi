# Alcance de la demo Jopói

Estado: alcance confirmado globalmente en Q31. Fase actual: preparar specs; no escribir código. Fecha: 2026-10-22.

Este documento es la fuente vigente del alcance. Integra las cinco rondas de definición, incluida la corrección de Q26 a presupuesto cero. La aplicación todavía no está implementada.

## Propósito y público

Construir un prototipo personal para mostrar el concepto de Jopói, probar su recorrido y recibir comentarios. El caso explica el beneficio de coordinar abastecimiento y transporte a compradores industriales y posibles aliados. El lanzamiento comercial pertenece a una evolución posterior.

El escenario usa chips forestales sin tratar en el corredor de Santa Rosa, Corrientes. Empresas, cantidades, rutas, precios, fotos y comprobantes son ejemplos ficticios identificados como tales. Los registros enviados a Hedera testnet sí son reales.

La landing explica el beneficio antes de presentar blockchain. Tendrá dos accesos: «Probar demo» abre la experiencia guiada; «Book a demo» permite solicitar conocer el prototipo mediante un formulario real de contacto. No reserva horarios ni envía correos automáticos.

## Arquitectura y presupuesto acordados

| Elemento | Decisión |
| --- | --- |
| Aplicación | Next.js; experiencia usable en escritorio y móvil. |
| Persistencia | PostgreSQL en Neon Free mediante Prisma. JSONB para metadatos flexibles; sin segunda base NoSQL. |
| Hosting | Vercel Free/Hobby, con finalidad de prototipo personal acordada en Q27. |
| Trazabilidad | Hedera Consensus Service —HCS— en testnet. El servidor Jopói firma los registros. |
| Identidad | Sesión anónima; cambio de roles claramente simulado. Sin wallets ni firmas independientes de empresas reales. |
| Trabajo automático | Barrido diario de pendientes y limpieza. Reintentos durante la interacción y manuales; sin revisión horaria ni programador externo. |
| Presupuesto | Cero. Sin planes pagos, tarjetas, cargos, compras de HBAR reales ni upgrades automáticos. |

Neon y los recursos gratuitos pueden pausar el servicio o agotar cuotas. Se muestra la indisponibilidad real y se conserva el límite de gasto. No se sustituye esa situación por un plan pago o una confirmación simulada.

La finalidad personal es el alcance acordado, no una garantía general de elegibilidad otorgada por Vercel. Las condiciones consultadas y límites técnicos constan en [infraestructura](infraestructura-demo.md).

## Unidad de operación y participantes

Cada operación vincula un lote completo, un comprador y un viaje. No se fracciona el lote ni se consolidan varios lotes en un camión. Esto limita la demo; no impone esa restricción al negocio futuro.

| Rol representado | Acciones |
| --- | --- |
| Generador | Modifica cantidad y humedad declaradas en borrador; publica. |
| Coordinador | Aprueba o rechaza con motivo de ejemplo; confirma transporte compatible. |
| Transportista | Confirma retiro. |
| Comprador | Registra peso recibido; confirma recepción conforme o incidencia. |

Un visitante representa todos los roles dentro de su sesión. Ese cambio no crea identidades de terceros ni sus firmas independientes. El servidor solo permite modificar datos propios de la sesión.

## Recorrido y reglas

Recorrido exitoso: **borrador → publicado → aprobado → asignado → retirado → recibido**.

Desde publicado se puede rechazar el lote. Desde retirado se puede cerrar con incidencia de recepción. Rechazo e incidencia son terminales; no hay resolución de disputas ni edición retroactiva de eventos. Para explorar otro resultado se inicia otro recorrido, sujeto a cuota.

Las reglas aceptadas en Q30 son:

- Cantidad positiva y humedad declarada entre 0 y 100%.
- No aprobar si la humedad supera el requisito precargado del comprador.
- No asignar un viaje incompatible.
- Peso recibido positivo. La coincidencia con el declarado permite recepción conforme; una diferencia exige incidencia.
- Tolerancia cero de peso exclusivamente como simplificación de la demo, sin presentarla como estándar industrial.

El escenario contiene un comprador con requisitos y dos viajes precargados, inicialmente uno compatible y otro incompatible. La interfaz explica compatibilidad por material, capacidad, carrocería, ruta y horario; el coordinador confirma la elección. Si los datos editados dejan al lote sin alternativa compatible, se informa y se bloquea la asignación.

Las fotos y el comprobante de pesaje son precargados y ficticios. No se solicitan archivos al visitante.

## QR y consulta pública

El QR identifica lote/carga y abre una consulta compartible de solo lectura, sin registro. Para chips a granel no se exige un precinto por recipiente. Conocer el QR no autoriza modificar la operación: retiro y recepción son acciones separadas.

La consulta muestra los datos ficticios de la operación y la prueba de registro disponible. Contactos, credenciales, secretos e identificadores privados de sesión quedan fuera de esa vista y del contenido enviado a HCS.

## Hitos, verificación y fallos

Se envían a HCS publicación, aprobación o rechazo, asignación, retiro y recepción conforme o incidencia. El camino exitoso tiene cinco hitos. Borradores, cambios de rol, navegación y consulta QR no generan transacciones.

Cada registro incluye identificadores públicos, tipo de evento, rol simulado, versión del formato, marca de demo y hash del detalle. La consulta permite ver el detalle, contrastar el hash y consultar la confirmación real. El registro acredita una declaración de Jopói, no la verdad física de una carga.

Primero se guarda la acción y su pendiente en PostgreSQL. El recorrido puede continuar mientras el registro de red está pendiente. Se comprueba el resultado conocido antes de reenviar, con hasta tres intentos automáticos y reintento manual acotado. La revisión se realiza durante la interacción y en el barrido diario.

La interfaz distingue estado operativo, estado de envío y disponibilidad de verificación. Un timeout o una demora del mirror node no se presenta como fracaso definitivo ni como confirmación. No se promete atomicidad ni ejecución exactamente una vez entre SQL y Hedera.

## Sesiones, cuotas y retención

| Recurso | Política |
| --- | --- |
| Sesión | 24 horas desde su creación; permite modificar solo datos propios. |
| Recorridos | Tres por sesión, incluido el inicial. Reiniciar consume otro y no renueva la sesión. |
| Envíos HCS | Límite global configurable de 100 mensajes diarios, aplicado en servidor. |
| Datos operativos | Vencen siete días después de crear el recorrido; se bloquea su acceso al vencer. |
| Contactos | Vencen 90 días después de enviar la solicitud. |
| Borrado físico | En la siguiente ejecución diaria exitosa; no necesariamente al segundo del vencimiento. |

Al agotarse el cupo se pausa el envío y se informa qué quedó pendiente; no se inventa confirmación. Reiniciar o limpiar la base no elimina mensajes ya enviados a testnet. La red puede reiniciarse por su propia política.

## Formulario y explicación económica

El formulario real de contacto solicita nombre, email, empresa y mensaje opcional para conocer el prototipo. No exige dominio empresarial. Guarda la solicitud y muestra confirmación solo si se guardó. Se consulta mediante CSV desde una herramienta interna privada, sin panel administrativo público, calendario, CRM ni envío automático de mensajes.

La demo desglosa material, transporte y tarifa Jopói, y compara con una alternativa de transporte. Importes y ahorro se señalan como supuestos ilustrativos; no son cotizaciones, resultados observados ni precios comerciales definitivos.

## Exclusiones y evolución

Quedan fuera: operaciones comerciales de cargas reales; pagos, escrow y facturación fiscal; mainnet, tokens y créditos ambientales certificados; GPS en vivo y APIs de flotas; IA y optimización automática de rutas; sincronización offline completa; subida de archivos; fraccionamiento y consolidación de lotes; compra o distribución de infraestructura física; cuentas empresariales reales, wallets y firmas independientes; disputas y correcciones retroactivas; calendario, CRM, correos automáticos y panel administrativo público; planes pagos y programadores externos.

Offline completo, integraciones y lanzamiento comercial son evoluciones explícitas, sujetas a un nuevo alcance. No se prometen fraude cero, calidad garantizada, reclasificación jurídica automática ni beneficios ambientales certificados.

## Criterios de aceptación

La implementación se considera terminada cuando se verifica:

1. URL en Vercel Hobby, con landing de prototipo personal y uso en escritorio y móvil.
2. Recorridos de recepción conforme, rechazo e incidencia completos, persistidos y con terminales respetadas.
3. Validaciones de Q30 y bloqueo de transporte incompatible aplicados en servidor.
4. Aislamiento entre sesiones, edición solo en borrador y ausencia de acciones duplicadas por doble clic o concurrencia.
5. QR compartible de consulta, sin permisos de modificación ni exposición de contactos o credenciales.
6. Los cinco hitos de un recorrido exitoso tienen registro real en testnet y detalle/hash contrastables cuando la red está disponible.
7. Fallos, resultados inciertos, cuotas y demora del mirror node muestran su estado real; SQL persiste antes del envío.
8. Tres recorridos por sesión, cuota global de HCS, expiración y retención funcionan desde servidor.
9. Barrido diario protegido e idempotente: procesa pendientes y limpieza en lotes acotados, sin proceso permanente ni revisión horaria.
10. Formulario real guardado, confirmación veraz y exportación CSV privada; sin correos ni reservas automáticas.
11. Evidencia, importes y roles simulados están identificados; no se presentan operaciones ficticias como actividad comercial validada.
12. Recursos en capas gratuitas, sin datos de pago, cargos ni upgrades automáticos; indisponibilidad visible ante límites.
13. Instrucciones reproducibles para desarrollo, configuración de secretos, migración, despliegue y recreación de recursos tras un reset de testnet.
14. Ninguna credencial queda en cliente, repositorio, páginas públicas o mensajes HCS.

Estos son criterios por ejecutar al implementar, no resultados de pruebas ya realizadas.

## Cierre del árbol de decisiones

| Rama | Acuerdo |
| --- | --- |
| D1–D2: público y escenario | Q1–Q2, precisadas por Q27: caso industrial forestal en un prototipo personal. |
| D3–D4: acceso y contacto | Q3–Q4, Q8–Q11, Q17, Q19: anónimo, guiado, QR de consulta y formulario real con CSV privado. |
| D5–D6: límites y presupuesto | Q5–Q6, corrección Q26: presupuesto cero, Vercel Free y exclusiones explícitas. |
| D7: operación y validaciones | Q7, Q12–Q14, Q23, Q30: unidad, estados, compatibilidad y reglas numéricas. |
| D8: Hedera y recuperación | Q15, Q20–Q22, ajustadas por Q28: firma Jopói, eventos verificables y barrido diario. |
| D9: datos | Q16 y Q29: Neon Free, PostgreSQL, Prisma y JSONB; sin NoSQL ni uploads. |
| D10–D11: contactos y operación del sistema | Q18–Q19, Q24–Q25, Q28: cuotas, plazos, limpieza y tareas diarias. |
| D12: cierre global | Q31 confirmó el cierre de la definición. El usuario aclaró después que primero deben prepararse las specs y que todavía no se debe escribir código. |

No quedan preguntas de alcance abiertas. Versiones, esquema concreto, nombres de rutas, formato exacto, manejo de conexiones y diseño visual son trabajo de implementación dentro de estos límites, sin ampliar funcionalidades ni autorizar gasto.

## Documentos relacionados

- [Modelo de dominio de la demo](modelo-demo.md).
- [Flujo y trazabilidad](flujo-y-trazabilidad.md).
- [Infraestructura y fuentes oficiales](infraestructura-demo.md).
- [Viabilidad técnica](viabilidad-tecnica-demo.md).
- [Contexto y evolución](contexto-y-evolucion.md).
- [Glosario](../GLOSSARY.md).
- ADR: [demo separada del piloto comercial](adr/0001-demo-tecnica-separada-del-piloto.md), [firma de Jopói](adr/0002-firma-de-jopoi-en-la-demo.md), [presupuesto cero](adr/0003-presupuesto-cero-y-vercel-free.md).
