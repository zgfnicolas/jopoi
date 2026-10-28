# S19 · Persistencia y despliegue gestionados desde Vercel

Fecha: 2026-10-27. Dependencias: persistencia, despliegue y aceptación existentes.

Estado: configuración, herramientas privadas y evidencia v2 implementadas; ver [procedimiento S19](../persistencia-gestionada-desde-vercel.md). Aprovisionamiento, validación del plan en la cuenta, despliegue y aceptación remota pendientes de acceso y evidencia externa. Se reutilizan los límites de API y navegador existentes, más pruebas CLI de selección de entorno y aceptación documental. Publicación en el tracker pendiente de configuración; `ready-for-agent` todavía no aplicada.

Verificación local: 15 pruebas CLI, 28 de API y 28 de navegador aprobadas, además de TypeScript, validación Prisma y build de producción. El responsable eligió dejar el despliegue pendiente. El [registro de implementación](../persistencia-gestionada-desde-vercel.md) distingue esta evidencia local de la aceptación remota todavía no realizada.

## Problem Statement

El responsable de Jopói quiere desplegar y gestionar la aplicación y su persistencia desde Vercel, sin tener que crear cuentas independientes ni configurar manualmente un servicio de base de datos fuera de esa plataforma. Aclaró que acepta que Vercel utilice proveedores externos por detrás: busca una gestión centralizada, sin tener que ocuparse de esos proveedores en la preparación y operación habitual de la demo.

La arquitectura documentada exige Neon Free para el despliegue, aunque el acceso implementado utiliza PostgreSQL estándar mediante Prisma y pg. Neon aparece también en instrucciones operativas y en la evidencia de aceptación del candidato. La preparación debe pasar a un flujo iniciado desde Vercel, con la base vinculada al proyecto y sus credenciales sincronizadas por la integración.

Vercel Postgres y Vercel KV ya no están disponibles con esos nombres. Las integraciones nativas de Vercel Marketplace permiten aprovisionar bases de terceros desde Vercel, sin crear una cuenta separada en el sitio del proveedor. Este modelo satisface el alcance aclarado, sujeto a verificar la compatibilidad y las condiciones gratuitas del recurso elegido.

## Solution

Publicar Jopói en Vercel Hobby y aprovisionar su base PostgreSQL mediante una integración nativa del Marketplace, vinculada al mismo proyecto. Centralizar en Vercel la creación del recurso, la selección de su plan, la conexión por entorno, las credenciales, el despliegue y las opciones de gestión y consumo que ofrezca la integración. Mantener el funcionamiento observable de la demo y el presupuesto cero.

El responsable no necesita crear una cuenta independiente en Neon ni configurar conexiones desde un panel externo para completar la preparación habitual. La aplicación sigue accediendo a PostgreSQL mediante su capa privada existente. El proveedor subyacente puede seguir siendo Neon si su integración nativa cumple estas condiciones; sustituirlo no es un objetivo por sí mismo.

El criterio de éxito es una URL publicada con persistencia durable, configuración reproducible desde Vercel y sin administración independiente del proveedor para las tareas habituales. El nombre y el plan reales del servicio se documentan para mantenimiento; no se exige que el responsable conozca sus detalles para usar la demo. Cualquier función avanzada que requiera un panel externo debe identificarse antes de dar por cumplido el flujo centralizado.

## User Stories

1. Como responsable del prototipo, quiero desplegar Jopói en Vercel, para compartir una URL funcional de la demo.
2. Como responsable del prototipo, quiero crear la base desde Vercel Marketplace, para evitar configurar un servicio de datos por separado.
3. Como responsable del prototipo, quiero utilizar una integración nativa de PostgreSQL, para gestionar la base desde el proyecto de Vercel aunque la opere un tercero.
4. Como responsable del prototipo, quiero completar la preparación sin abrir una cuenta independiente en el proveedor, para reducir los pasos de configuración.
5. Como responsable del prototipo, quiero que la integración conecte la base y sincronice sus credenciales por entorno, para evitar copiar conexiones manualmente desde otro panel.
6. Como responsable del prototipo, quiero gestionar el recurso y su plan desde Vercel, para no necesitar conocer la infraestructura subyacente durante la operación habitual.
7. Como responsable del prototipo, quiero conservar el presupuesto cero y Vercel Hobby, para publicar sin tarjetas, planes pagos ni upgrades automáticos.
8. Como responsable del prototipo, quiero que el agotamiento de recursos produzca una indisponibilidad honesta, para evitar cargos o pérdidas silenciosas de información.
9. Como responsable del prototipo, quiero distinguir una base local de una base publicada realmente utilizada, para no confundir las pruebas locales con la entrega.
10. Como visitante de la demo, quiero recuperar mi recorrido después de recargar la página, para continuar una operación persistida.
11. Como visitante de la demo, quiero conservar mi recorrido entre instancias y despliegues de la aplicación, para que la persistencia no dependa de la memoria de un proceso.
12. Como visitante de la demo, quiero que mi sesión solo permita consultar y modificar mis recorridos, para mantener su aislamiento.
13. Como generador simulado, quiero guardar y publicar un lote con las mismas reglas, para que el cambio de infraestructura preserve la experiencia.
14. Como coordinador simulado, quiero aprobar o rechazar el lote y asignar un transporte compatible, para continuar la operación sin cambios de comportamiento.
15. Como transportista simulado, quiero confirmar el retiro de la carga una sola vez aunque reintente la acción, para evitar eventos duplicados.
16. Como comprador simulado, quiero registrar una recepción conforme o una incidencia de recepción, para mantener el resultado documentado de la operación.
17. Como visitante de la demo, quiero recibir un conflicto cuando dos acciones compiten por una versión del recorrido, para evitar sobrescribir cambios aceptados.
18. Como visitante de la demo, quiero que una acción se confirme únicamente cuando su estado, recibo, evento y publicación pendiente queden persistidos juntos, para no recibir confirmaciones parciales.
19. Como persona que consulta la trazabilidad, quiero conservar los identificadores públicos, el historial y sus hashes, para poder contrastar la misma operación después de una migración.
20. Como persona que consulta la trazabilidad, quiero ver estados honestos de publicación y verificación en Hedera testnet, para distinguir la persistencia local del registro en la red.
21. Como persona interesada en Jopói, quiero que mi solicitud de demo se guarde de forma privada, para que el responsable pueda contactarme.
22. Como responsable del prototipo, quiero exportar las solicitudes de demo vigentes mediante la herramienta privada existente, para conservar la gestión de contactos.
23. Como responsable del prototipo, quiero conservar cuotas, intentos y tareas pendientes entre instancias, para que los reintentos no eludan los límites establecidos.
24. Como responsable del prototipo, quiero mantener el barrido diario y la retención de datos, para eliminar vencidos sin afectar información vigente.
25. Como responsable del prototipo, quiero separar las conexiones y los datos de desarrollo, Preview y Production, para que una prueba no modifique el candidato publicado.
26. Como responsable del prototipo, quiero conservar las credenciales exclusivamente en el servidor y en herramientas privadas, para que no aparezcan en respuestas públicas ni en logs.
27. Como responsable del prototipo, quiero inventariar y respaldar los datos existentes antes de cualquier traslado, para evitar pérdidas durante el cambio.
28. Como responsable del prototipo, quiero poder volver a la configuración anterior si falla una migración, para recuperar la demo con un estado de datos conocido.
29. Como responsable del prototipo, quiero validar el candidato desplegado con los recorridos existentes, para comprobar que el cambio de persistencia funciona fuera de mi equipo.
30. Como responsable del prototipo, quiero una guía de preparación centrada en Vercel y evidencia del recurso conectado, para repetir el despliegue sin administrar al proveedor por separado.

## Implementation Decisions

- **Alcance confirmado:** centralizar despliegue y gestión habitual de la persistencia en Vercel. El responsable acepta proveedores externos operando por detrás. Se elimina la exigencia anterior de usar exclusivamente productos propios de Vercel y el bloqueo técnico basado en esa interpretación.
- **Tipo de integración:** usar una integración nativa de Vercel Marketplace que aprovisione el recurso desde Vercel, gestione su plan y entregue credenciales al proyecto. Una integración que solo conecta una cuenta creada y administrada por separado no satisface el flujo solicitado.
- **Selección de PostgreSQL:** priorizar Neon mediante su integración nativa para conservar la tecnología ya documentada y minimizar cambios, siempre que el plan disponible cumpla presupuesto cero, ausencia de tarjeta y ausencia de upgrades automáticos. Si no cumple, evaluar otra integración nativa PostgreSQL compatible con el mismo flujo y las mismas restricciones; no contratar un plan pago como sustitución. Registrar el producto realmente seleccionado y sus condiciones verificadas al implementar.
- **Productos vigentes:** usar la integración actual de PostgreSQL del Marketplace. No instalar los paquetes retirados de Vercel Postgres o Vercel KV ni depender de que reaparezcan esos productos.
- **Productos propios disponibles:** Vercel Blob se orienta a archivos y Global Config a configuración de lectura frecuente y escritura poco frecuente. No se propone utilizarlos como sustitutos del almacenamiento transaccional de Jopói: la aplicación necesita integridad relacional, escrituras atómicas, control de concurrencia y coordinación durable que no quedan resueltos por guardar documentos o configuración.
- **Experiencia operativa:** la guía comienza en el proyecto Vercel y cubre aprovisionamiento, plan gratuito, vinculación de entornos, configuración, migraciones, comprobación de conexión, despliegue y mantenimiento diario. Las herramientas privadas del repositorio pueden aplicar migraciones, exportar contactos y comprobar la base usando las credenciales del proyecto; no necesitan una cuenta administrativa independiente en el proveedor. Inventariar qué tareas avanzadas exponen las integraciones mediante un panel del proveedor y comprobar que no sean obligatorias para la preparación y operación habituales.
- **Acceso existente reutilizable:** conservar como primera opción la entrada privada de base de datos y su fábrica de clientes PostgreSQL. El proyecto usa Prisma, el adaptador PostgreSQL y pg, sin dependencia directa de un SDK Neon. No crear un repositorio genérico, una interfaz multiproveedor ni adaptadores adicionales sin una necesidad demostrada por el destino finalmente aprobado.
- **Persistencia requerida:** mantener sesiones, recorridos, intenciones idempotentes, recibos de comandos, eventos, publicaciones e intentos HCS, leases de mantenimiento, cuotas diarias y solicitudes de demo. Mantener UUID, precisión de cantidades, fechas, snapshots y hashes sin reinterpretación.
- **Atomicidad requerida:** conservar aislamiento serializable y las restricciones, claves, índices y triggers existentes. Estado de operación, recibo idempotente, evento y pendiente se confirman o revierten juntos. Ningún envío a Hedera se realiza dentro de una transacción SQL.
- **Contratos públicos:** conservar rutas, autorización, códigos de error, DTO, QR y consulta de trazabilidad existentes. El cambio de infraestructura no añade endpoints ni modifica las reglas de generador, coordinador, transportista o comprador.
- **Entornos y conexiones:** utilizar las credenciales que sincronice la integración con el proyecto y documentar su correspondencia con la conexión de aplicación y la conexión administrativa de migraciones. Si sus nombres difieren del contrato interno, establecer un mapeo explícito en la configuración privada. No inferir nombres de variables del proveedor ni asumir que Preview y Production comparten datos. Mantener límites de conexiones y TLS válidos para el destino; no exponer credenciales con prefijos públicos.
- **Módulos afectados:** configuración privada de entorno, acceso a la base, preparación y comprobación del despliegue, herramientas administrativas de migración y diagnóstico, validación de evidencia de aceptación y documentación de infraestructura. Modificar servicios de dominio solo si aparece una incompatibilidad real y se documenta su resolución.
- **Esquema y migraciones:** no se requiere un cambio de modelo por el solo hecho de cambiar de proveedor PostgreSQL. Conservar las migraciones aplicadas sin reescribirlas; validar compatibilidad de SQL y permisos en el destino antes del traslado.
- **Datos existentes:** comprobar primero si existe una base remota independiente y contiene información. Si no existe, aprovisionar una nueva desde Vercel y aplicar las migraciones. Si existe, verificar si el proveedor ofrece incorporarla a la gestión nativa sin pérdida de datos y sin exigir una cuenta independiente para operar habitualmente; no asumir que enlazar una base externa convierte su administración en nativa. Si hace falta trasladar datos, definir respaldo, restauración de prueba, pausa de escrituras durante el corte y comprobaciones de integridad. Preservar también el historial de migraciones y la coordinación HCS para no reenviar publicaciones ya confirmadas.
- **Recuperación:** conservar el origen durante la validación del destino. Antes de reabrir escrituras, la vuelta al origen puede apoyarse en la pausa y la comprobación de integridad; después de aceptar escrituras nuevas requiere reconciliación explícita, no basta con cambiar una URL. No dar de baja Neon ni borrar sus datos como parte de esta fase de especificación.
- **Aceptación y documentación:** la evidencia actual exige Neon Free de forma explícita. Acreditar además que el recurso se aprovisiona y se vincula mediante Vercel, que las credenciales se sincronizan y que el plan no permite cargos bajo la configuración seleccionada. Si se selecciona otro proveedor, adaptar la comprobación al recurso real sin eliminar controles de gratuidad ni registrar como aprobada evidencia inexistente. La aceptación debe demostrar el flujo completo sin alta independiente en el proveedor.
- **Decisiones anteriores:** esta aclaración sustituye la interpretación estricta anterior de S19. La elección previa de Neon sigue siendo compatible cuando se gestiona mediante una integración nativa; su sustitución deja de ser obligatoria. Mantener presupuesto cero, finalidad de demo personal y mantenimiento diario. Al implementar, actualizar la documentación operativa y cualquier decisión de infraestructura afectada para reflejar el recurso real. La firma de Jopói y la integración con Hedera testnet conservan su alcance y configuración específica; centralizar la base no implica que Vercel aprovisione la cuenta o el topic de Hedera.

## Testing Decisions

- **Límite principal propuesto:** reutilizar la API HTTP real de la aplicación como punto de observación de la persistencia. Es el límite más alto existente para verificar conjuntamente autorización, reglas, atomicidad, concurrencia e idempotencia. No crear mocks de Prisma ni pruebas de métodos privados para demostrar una migración.
- **Límites existentes:** conservar API HTTP y navegador, previamente confirmados para la demo. La aclaración sobre la gestión en Vercel no requiere introducir un nuevo límite de pruebas.
- **Antecedentes:** la suite de API existente arranca Next.js y PostgreSQL real en un entorno aislado, con HCS y mirror controlados. Los casos de persistencia ya observan rollback y caída real de la base; los de recorridos, contactos y publicación cubren los consumidores relevantes. Ampliar únicamente donde falte comportamiento afectado por el destino aprobado.
- **Comportamiento a conservar:** acciones concurrentes no pierden cambios; repetir una intención no duplica eventos; un fallo de confirmación SQL no deja una operación parcial; una caída de base devuelve indisponibilidad sin éxito ficticio; una sesión ajena no accede a un recorrido.
- **Durabilidad y coordinación:** comprobar recuperación después de reiniciar la aplicación, idempotencia y cuotas compartidas entre instancias, mantenimiento sin doble ejecución, retención y continuidad de publicaciones pendientes. Observar resultados mediante API y herramientas administrativas existentes; evitar aserciones que dependan de detalles internos del adaptador.
- **Contactos y privacidad:** reutilizar las pruebas de solicitud de demo y exportación privada. Comprobar que los datos personales no aparecen en trazabilidad pública, eventos ni respuestas de error.
- **Límite complementario existente:** reutilizar los recorridos Playwright de escritorio y móvil para guardar, publicar, coordinar, retirar, recibir y consultar trazabilidad, además del formulario de solicitud de demo. No añadir otro harness de navegador.
- **Validación del destino y del flujo Vercel:** una suite aprobada con PostgreSQL local demuestra regresiones funcionales, pero no acredita compatibilidad, cuotas o conectividad del servicio elegido. Comprobar desde Vercel la creación del recurso con integración nativa, selección del plan gratuito, conexión al proyecto, sincronización de credenciales y aislamiento de entornos. Verificar conexión real, migraciones, persistencia tras reinicio o redeploy y operación gratuita en el candidato publicado. El procedimiento habitual debe completarse sin crear una cuenta independiente ni configurar la base desde el panel del proveedor.
- **Validación del traslado:** si existen datos, contrastar recuentos y relaciones, precisión, identificadores públicos, hashes y estados pendientes antes y después del corte; ensayar restauración y recuperación con datos controlados. No provocar fallos destructivos sobre una base con datos reales para ejecutar pruebas.
- **Regla de cierre:** mantener separadas la evidencia de regresión local, la aceptación del despliegue y la verificación real en Hedera. Dar por cumplida la centralización cuando el procedimiento desde Vercel funcione y preserve las garantías de la demo, aunque la base sea operada por un tercero. Documentar cualquier tarea necesaria que todavía obligue a administrar ese proveedor por separado antes de cerrar la aceptación.
- **Implementación posterior:** la fase de especificación no provisionó recursos. S19 incorpora configuración y evidencia documental, pruebas CLI y regresión local. Esa verificación no acredita por sí sola aprovisionamiento, despliegue ni envíos reales a testnet.

## Out of Scope

- Implementar o desplegar la migración durante la creación de esta especificación.
- Contratar servicios, autorizar cargos, tarjetas o upgrades automáticos.
- Eliminar proveedores externos de la infraestructura subyacente o cambiar Neon únicamente por ser un tercero.
- Exigir al responsable una cuenta independiente o configuración manual en el proveedor para completar el flujo habitual de base de datos.
- Añadir Redis o un segundo almacén por la mera mención de Vercel KV; no se ha identificado una necesidad funcional adicional.
- Reemplazar PostgreSQL por archivos Blob, configuración global, memoria de proceso o almacenamiento temporal como solución a la persistencia transaccional.
- Cambiar de plataforma de hosting, rediseñar el dominio o modificar la experiencia de la demo.
- Retirar Hedera testnet, sus pendientes persistidos o su verificación de trazabilidad.
- Borrar datos o cancelar el servicio de origen antes de completar y validar un traslado aprobado.

## Further Notes

Fuentes oficiales verificadas el 2026-10-27:

- [Postgres on Vercel](https://vercel.com/docs/postgres): retirada de Vercel Postgres, transición a Neon y uso actual de proveedores externos mediante Marketplace.
- [Redis on Vercel](https://vercel.com/docs/redis): retirada de Vercel KV, transición a Upstash y uso actual de integraciones externas.
- [Vercel Storage](https://vercel.com/docs/storage): distinción entre Blob para archivos, Global Config para configuración y Marketplace para bases relacionales y clave-valor.
- [Native integration concepts](https://vercel.com/docs/integrations/create-integration/native-integration): aprovisionamiento sin alta independiente en el proveedor, selección de planes desde Vercel, gestión de recursos y credenciales por entorno.
- [Add a Native Integration](https://vercel.com/docs/integrations/install-an-integration/product-integration): procedimiento de instalación y conexión de recursos desde Vercel.

El responsable confirmó que la gestión centralizada mediante Vercel Marketplace es el resultado buscado y acepta los proveedores externos subyacentes. La retirada de Vercel Postgres y Vercel KV deja de constituir un bloqueo. La implementación deberá verificar el plan gratuito y las capacidades de la integración disponible; esta spec no acredita que ya exista una base provisionada ni una publicación aceptada.

No se inspeccionaron credenciales ni se consultó una base remota. El repositorio documenta aceptación externa pendiente; esta revisión no certifica la existencia ni el contenido de un recurso Neon desplegado.

La documentación del proyecto indica que el tracker no está configurado. Existe un remoto GitHub, pero no una instrucción de tracker que sustituya ese estado documentado. Ejecutar `/setup-matt-pocock-skills` para configurar el destino de publicación. La etiqueta solicitada por la skill es `ready-for-agent`; todavía no se creó una issue ni se aplicó esa etiqueta.
