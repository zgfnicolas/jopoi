# S22 · Profesionalización integral, seguridad y confiabilidad

Estado: especificación para implementación; no acredita controles implementados ni aceptación de producción.

Fecha: 2026-10-30. Base: auditoría full-stack del 2026-10-30, revisión `dc8672e02abed9811caf7d8726db67030cff8823`, y alcance vigente S01–S21. Esta spec cubre los 17 hallazgos AUD-01–AUD-17 y los seis bloques de calidad solicitados.

## Problem Statement

Jopói permite explorar una operación ficticia de chips forestales con persistencia, aislamiento por sesión y trazabilidad en Hedera testnet. Sus controles actuales protegen varias invariantes importantes, pero el responsable todavía no puede demostrar que el sistema mantenga una operación segura, diagnosticable y sostenible ante abuso, crecimiento, saturación, cambios de versión o fallos prolongados.

Una sesión puede generar recibos sin un presupuesto específico, la limpieza diaria puede quedar detrás del volumen admitido, el árbol de producción contiene una dependencia con avisos de seguridad y una referencia pública de error no conduce necesariamente a un diagnóstico interno. El perfil TypeScript pedido produce 106 diagnósticos y no existe un gate integral de lint y pruebas. También faltan contratos HTTP verificables, políticas de navegador completas, un modelo de frescura por ruta, observabilidad continua y evidencia del entorno real.

Para el visitante, esas brechas pueden convertirse en indisponibilidad, información desactualizada o errores difíciles de resolver. Para la persona que solicita una demo, significan incertidumbre sobre la eliminación oportuna y protección de sus datos reales. Para el responsable, impiden distinguir una demo funcional de un servicio profesional con límites y evidencias explícitos.

## Solution

Profesionalizar la demo mediante una evolución del monolito modular existente: controlar el trabajo admitido y su retención, preservar invariantes con tipos y validación semántica, cerrar avisos de seguridad, estandarizar contratos y errores, endurecer navegador y sesiones, y establecer pruebas y operación medibles.

El visitante conservará una experiencia sin cuenta, con roles simulados, tres recorridos como máximo por sesión y mensajes claros cuando no haya capacidad. Las acciones confirmadas seguirán guardándose antes de publicar; los resultados inciertos nunca autorizarán un reenvío ciego. La trazabilidad será pública y de solo lectura, con estado, antigüedad y evidencia comprensibles.

El responsable tendrá referencias de error investigables, métricas y alertas con contexto seguro, puertas de calidad reproducibles, mantenimiento que converge bajo la carga admitida y procedimientos verificables de despliegue y recuperación. La aceptación distinguirá lo demostrado localmente de lo comprobado en el proveedor y con usuarios reales.

Se conservan los ADR: prototipo personal, presupuesto cero, PostgreSQL gestionado mediante integración nativa de Vercel, HCS testnet firmado por Jopói y cron diario. Si la capacidad gratuita no alcanza, se limita la admisión y se informa indisponibilidad; no se contratan servicios ni se amplía el producto de forma implícita.

## User Stories

1. Como responsable de Jopói, quiero relacionar cada brecha de la auditoría con un requisito y una evidencia, para conocer su estado real de cierre.
2. Como responsable, quiero distinguir controles locales, del proveedor y de campo, para no aprobar producción por una simulación.
3. Como visitante, quiero explorar la demo sin crear una cuenta, para comprender la propuesta con la menor fricción posible.
4. Como participante, quiero conservar los roles simulados y las reglas actuales del lote, para reconocer la misma operación después de la mejora.
5. Como visitante, quiero conocer los límites de capacidad antes de perder información, para decidir cuándo continuar.
6. Como visitante, quiero que una ráfaga ajena no impida toda consulta legítima, para seguir accediendo al recorrido.
7. Como responsable, quiero límites compartidos entre instancias, para que desplegar más procesos no multiplique el consumo permitido.
8. Como responsable, quiero limitar nuevas sesiones por día, para dimensionar su almacenamiento y posterior limpieza.
9. Como responsable, quiero limitar intenciones nuevas por recorrido y por día, para impedir crecimiento ilimitado de recibos.
10. Como propietario, quiero que repetir una intención ya enviada conserve un único efecto, para recuperarme de una respuesta perdida.
11. Como propietario, quiero que un límite temporal preserve mi intención pendiente, para reintentar sin duplicar la operación.
12. Como responsable, quiero rechazar trabajo antes de realizar preparaciones externas costosas, para proteger los recursos gratuitos.
13. Como consumidor de la API, quiero conocer cuándo reintentar mediante un contrato estable, para no generar más presión durante la saturación.
14. Como responsable, quiero que la limpieza pueda procesar más de una tanda por ejecución, para recuperar atraso sin exceder su presupuesto.
15. Como persona que solicitó una demo, quiero que mis datos vencidos se eliminen dentro de un objetivo verificable, para no depender de una limpieza indefinida.
16. Como responsable, quiero conocer la antigüedad del vencido más viejo, para detectar una retención física atrasada.
17. Como responsable, quiero que cada categoría de limpieza progrese, para que una acumulación no postergue indefinidamente a las demás.
18. Como responsable, quiero acotar también los hijos eliminados por cascada, para que un recorrido grande no bloquee el mantenimiento.
19. Como participante, quiero que un lease vigente proteja el trabajo en curso, para no perder evidencia durante una publicación.
20. Como responsable, quiero comprobar recuperación después de varios días sin mantenimiento, para saber si el atraso converge.
21. Como mantenedor, quiero resolver dependencias afectadas sin degradar arbitrariamente el SDK, para conservar compatibilidad y seguridad.
22. Como responsable, quiero conocer si un aviso es alcanzable en Jopói, para priorizarlo con evidencia y sin ocultarlo.
23. Como mantenedor, quiero un lockfile reproducible y análisis continuo de avisos, para detectar nuevas exposiciones antes de integrar cambios.
24. Como visitante, quiero una referencia segura cuando ocurra un error, para poder comunicarlo sin compartir datos privados.
25. Como responsable operativo, quiero reconstruir una solicitud y su trabajo diferido desde esa referencia, para investigar el fallo.
26. Como mantenedor, quiero conservar la causa original de errores transformados, para encontrar el origen sin publicarlo al cliente.
27. Como responsable, quiero que logs, traces y métricas excluyan secretos y PII, para que la observabilidad no cree otra exposición.
28. Como responsable, quiero distinguir errores esperables de errores internos, para recibir señales útiles en lugar de ruido.
29. Como mantenedor, quiero que todo el proyecto compile con las tres opciones estrictas, para detectar incertidumbres antes de ejecutar.
30. Como mantenedor, quiero tipos y schemas que impidan estados operativos inconsistentes, para no reconstruir operaciones inválidas.
31. Como mantenedor, quiero casts de adaptación limitados y justificados, para que una assertion no sustituya una validación.
32. Como mantenedor, quiero comentarios claros en español rioplatense, para entender invariantes y decisiones sin traducir convenciones locales.
33. Como mantenedor, quiero lint, tipos y pruebas en una puerta automática, para que un cambio incompleto no se integre.
34. Como mantenedor, quiero que los comandos de calidad incluyan explícitamente API, CLI y UI, para no confundir una suite parcial con toda la aceptación.
35. Como responsable, quiero que el build de producción se compruebe, para detectar errores que no aparecen en desarrollo.
36. Como consumidor de la API, quiero un contrato OpenAPI validado, para conocer entradas, respuestas, permisos y errores admitidos.
37. Como consumidor, quiero Problem Details con códigos estables, para manejar fallos de manera uniforme.
38. Como consumidor, quiero una política de evolución de la API pública, para migrar sin una ruptura silenciosa.
39. Como participante, quiero una clave idempotente estándar vinculada al recibo existente, para evitar dos mecanismos que puedan divergir.
40. Como participante, quiero una precondición de versión sobre la operación, para que una edición vieja no sobrescriba otra decisión.
41. Como lector público, quiero validadores HTTP correctos, para evitar transferencias redundantes sin recibir una representación equivocada.
42. Como propietario, quiero que ningún cambio de contrato mezcle mi información mediante caché, para conservar la privacidad.
43. Como visitante, quiero una política de scripts y frames restrictiva, para reducir inyecciones y páginas que suplanten la interfaz.
44. Como visitante, quiero que tema, formulario y QR funcionen bajo esa política, para que endurecer seguridad no rompa la demo.
45. Como propietario, quiero una cookie restringida al host HTTPS y no accesible a JavaScript, para reducir su exposición.
46. Como propietario, quiero terminar mi sesión de manera real, para impedir que una credencial conservada siga autorizando acciones.
47. Como propietario, quiero límites absolutos y por inactividad, para acotar la vigencia de una sesión abandonada.
48. Como participante, quiero que las mutaciones validen también un token CSRF de mi sesión, para reforzar la protección ante solicitudes inducidas.
49. Como visitante, quiero mensajes claros al vencer o cerrar la sesión, para comprender qué enlaces públicos siguen existiendo.
50. Como responsable, quiero que revocación, expiración y permisos fallen de forma cerrada, para no conceder acceso ante errores de infraestructura.
51. Como lector de trazabilidad, quiero recibir el historial inicial sin esperar la hidratación, para consultar el recorrido aun con JavaScript lento o deshabilitado.
52. Como lector, quiero que un recorrido inexistente o vencido tenga un status HTTP real, para distinguirlo de una página disponible.
53. Como visitante, quiero que la página reserve espacio durante la carga, para evitar saltos que interrumpan la lectura o una acción.
54. Como lector, quiero conocer cuándo se obtuvo el estado visible, para decidir si necesito actualizarlo.
55. Como participante, quiero que una vista demasiado vieja solicite una nueva lectura antes de escribir, para reducir conflictos evitables.
56. Como responsable, quiero mantener la landing prerenderizada cuando sea viable, para no pagar trabajo por solicitud sin beneficio.
57. Como visitante móvil, quiero recursos críticos priorizados y poco JavaScript inicial, para que la interfaz responda rápido.
58. Como responsable, quiero medir LCP, INP y CLS reales por ruta y dispositivo, para evaluar la experiencia observada y sus regresiones.
59. Como responsable, quiero presupuestos de JS y métricas de laboratorio automatizados, para detectar degradaciones antes del despliegue.
60. Como responsable, quiero verificar cercanía entre funciones y base de datos, para evitar latencia de red innecesaria.
61. Como responsable operativo, quiero distinguir latencia HTTP, espera de pool y duración externa, para intervenir sobre la causa correcta.
62. Como responsable, quiero límites globales de capacidad externa y del pool, para que la concurrencia no supere al proveedor.
63. Como participante, quiero que cancelar una lectura deje de consumir trabajo evitable, para no mantener solicitudes abandonadas.
64. Como responsable, quiero que las dependencias lentas respeten presupuestos completos de tiempo, para degradar de manera controlada.
65. Como responsable, quiero reintentos con dispersión y sólo cuando sean seguros, para no sincronizar nuevas ráfagas contra una dependencia caída.
66. Como participante, quiero que una publicación incierta conserve su identidad, para no generar otro registro por desconocer el resultado anterior.
67. Como responsable, quiero que una caída de HCS no invalide lo persistido ni toda la aplicación, para mantener disponible la lectura y la operación local.
68. Como responsable, quiero histogramas y saturación con cardinalidad acotada, para operar sin métricas costosas o inútiles.
69. Como responsable, quiero objetivos separados para guardar, publicar y limpiar, para no prometer la misma disponibilidad a dependencias distintas.
70. Como responsable, quiero alertas accionables con owner y runbook, para saber qué hacer cuando se consume el presupuesto de error.
71. Como responsable, quiero sondas livianas y separadas, para no provocar reinicios en cascada ante una caída de la base.
72. Como responsable, quiero detectar que el cron no se ejecutó, para intervenir antes de que se acumulen datos o publicaciones.
73. Como mantenedor, quiero consultar sólo los campos necesarios, para reducir transferencia, memoria y exposición accidental.
74. Como responsable, quiero índices justificados por planes y carga realista, para mejorar capacidad sin encarecer todas las escrituras.
75. Como mantenedor, quiero que las transacciones sigan siendo cortas y sin red externa, para conservar integridad sin retener conexiones.
76. Como responsable, quiero migraciones compatibles con versiones desplegadas simultáneamente, para evitar interrupciones durante el rollout.
77. Como responsable, quiero backfills por lotes con progreso reanudable, para no bloquear tablas por una transformación masiva.
78. Como responsable, quiero un único runner de migraciones con privilegios separados, para evitar carreras y permisos excesivos.
79. Como responsable, quiero ensayar restauración y recuperación sin reescribir evidencia HCS, para comprender qué puede recuperarse realmente.
80. Como responsable, quiero verificar TLS, grants, pooler y backups del proveedor seleccionado, para no confundir configuración con protección efectiva.
81. Como mantenedor, quiero probar comportamiento mediante las fronteras existentes, para refactorizar sin acoplar tests a funciones privadas.
82. Como mantenedor, quiero casos de abuso, fallos y carga multijornada, para verificar límites que un recorrido feliz no demuestra.
83. Como responsable, quiero que cada resultado registre la revisión y el entorno, para evitar mezclar evidencia incompatible.
84. Como responsable, quiero que evidencia faltante mantenga el cierre bloqueado o parcial, para no declarar profesionalización por omisión.
85. Como responsable, quiero que las mejoras respeten el presupuesto cero, para no introducir costos o proveedores no autorizados.
86. Como responsable, quiero conservar separados el contacto real, el evento de dominio y la telemetría, para no publicar PII en la trazabilidad.
87. Como mantenedor, quiero una secuencia de entregas con dependencias claras, para integrar mejoras revisables sin un cambio monolítico riesgoso.
88. Como responsable, quiero una matriz final por los seis estándares solicitados, para comprobar que todas las brechas aplicables quedaron resueltas.

## Implementation Decisions

### D01 · Alcance, invariantes y precedencia

- Se conserva el dominio: un lote completo, un comprador y un viaje; generador, coordinador, transportista y comprador son roles simulados por un visitante. No se introducen cuentas empresariales, pagos ni firmas independientes.
- La sesión mantiene 24 horas como máximo absoluto y tres recorridos como máximo. La retención de recorridos sigue siendo siete días y la de solicitudes de demo 90 días. Inactividad, cierre o revocación pueden terminar antes la autorización privada y deben explicarse en la interfaz.
- Estado de operación, confirmación HCS y contraste de hash siguen siendo ejes independientes. Ningún 200, 202, log, trace o sonda puede inventar una confirmación remota.
- Recibo, versión, cambio operativo, evento y pendiente se confirman atómicamente. La publicación sigue fuera de SQL. No se agregará otra outbox que duplique la fuente durable existente.
- Se mantienen Node 24, ESM, Next y Prisma compatibles con las versiones instaladas; toda actualización requiere revisar documentación de su versión y ejecutar regresión.
- Los criterios nuevos de S22 prevalecen en las mejoras que detallan sobre descripciones históricas S01–S21. La implementación ocurre después de esta fase documental y no queda autorizada por crear la spec.

### D02 · Admisión, cuotas técnicas e idempotencia

- Se amplía la admisión durable para lecturas privadas, nuevas sesiones, nuevas intenciones, comandos, reintentos y activación de trabajo externo. Las cuotas técnicas permanecen separadas del cupo de recorridos y de los 100 envíos HCS diarios.
- Se conservan límites rápidos por ventana y se agregan techos diarios y de cardinalidad. Propuesta inicial conservadora: 100 sesiones nuevas/día globales; 100 solicitudes de demo nuevas/día; 100 intenciones nuevas por recorrido; 5.000 intenciones nuevas/día globales; 30 lecturas privadas/minuto por sesión y 1.000/minuto globales; 10 intentos de mutación/minuto por sesión y 100/minuto globales; 6 activaciones de publicación/minuto por sesión y 60/minuto globales. Las políticas existentes de consulta pública, contraste y contacto no se relajan.
- Esos valores son topes iniciales propuestos, no capacidad demostrada. La admisión definitiva debe satisfacer D03 y D17. Si el benchmark no los soporta, se reducen documentadamente; aumentarlos exige otra medición y una nueva revisión de capacidad.
- Un replay válido no consume otra reserva de intención ni otro cupo de negocio, aunque sí consume capacidad de solicitud y verificación. No se permite consultar recibos ni resolver replays antes de comprobar sesión, propiedad y vigencia.
- La reserva de una intención y su escritura se coordinan atómicamente. El rechazo no deja estado, recibo o cuota de negocio parcial. Las carreras entre instancias no exceden un techo. Los límites diarios se calculan con una referencia temporal UTC explícita; los de ventana no reemplazan el techo diario.
- El control temprano de ingreso evita realizar parsing costoso, SQL repetido o llamadas externas ante ráfagas. No se usa Origin ni el header custom como prueba de identidad de un programa; siguen siendo controles de navegador.
- Se eligen claves HMAC rotadas según política para identificar visitantes sin guardar IP cruda. Los logs no contienen su material de derivación. El comportamiento frente a IPv6, NAT, ingreso confiable, ausencia de identidad y rotación debe estar documentado.
- La respuesta de rechazo usa 429 con Problem Details, referencia y Retry-After; agotamiento general de capacidad/dependencia usa 503 con Retry-After cuando pueda estimarse. El frontend conserva campos y la misma intención, informa la espera y no inicia polling ni retry automático.
- Configuración ausente, inválida o contador indisponible implica rechazo seguro. No hay fallback a contadores por proceso para producción.

### D03 · Capacidad de retención y limpieza que converge

- La capacidad se dimensiona con entradas máximas por día, retención, número máximo de hijos por recorrido y tiempo disponible del cron. Se incluyen sesiones, intenciones, recibos, eventos, intentos, historial técnico, contactos y buckets.
- El mantenimiento puede ejecutar varias tandas pequeñas por categoría dentro del presupuesto total. Se usa recorrido justo entre categorías y orden determinista por vencimiento e identificador. Un lote fallido no impide observar y avanzar otras categorías si hacerlo es seguro.
- Se conserva un máximo de 45 s de trabajo cooperativo dentro del límite de ejecución de 60 s. Antes de empezar otra tanda se reserva el peor presupuesto de transacción y el cierre. Los tamaños de lote se calculan con la cardinalidad de hijos; no se interpreta un límite de 100 padres como límite de trabajo total.
- Los recibos requeridos para idempotencia no se eliminan durante la vigencia de su recorrido. La limpieza de un agregado vencido puede escalonarse mediante un estado interno de purga y lotes dependientes, sólo si conserva bloqueo de acceso, integridad referencial, evidencia protegida y reanudación tras caídas. Antes de elegir esa complejidad se mide si el máximo de hijos ya acotado permite borrar el agregado en el presupuesto.
- Toda eliminación respeta leases vigentes y el fencing de propietario. No se debilitan triggers ni se reescriben payloads, digests o identidades enviadas para acelerar el borrado.
- Con carga sostenida al techo final de admisión, una ejecución diaria completa elimina al menos el vencimiento diario generado y conserva capacidad para recuperar atraso. El ensayo de siete días sin cron debe volver a un atraso de como máximo un día después de tres ejecuciones diarias exitosas; si no ocurre, se reduce admisión o se mejora la limpieza.
- Objetivo de eliminación física en operación normal: dentro de 36 h del vencimiento, con cron diario exitoso. No se lo presenta como garantía durante una caída del programador o proveedor. Se registra y alerta cualquier incumplimiento y se ofrece recuperación administrativa manual ya existente.
- Se mide conteo pendiente, antigüedad máxima, eliminados, categorías sin progreso y última ejecución parcial/completa. La ausencia del cron es un incidente independiente de su resultado.

### D04 · Dependencias y cadena de suministro

- Se resuelve el árbol SDK → ethers → ws afectado por los avisos de memoria y DoS de la auditoría. Preferencia: actualización compatible del proveedor; alternativa: override acotado, documentado y probado cuando sea compatible. No se acepta el downgrade automático sugerido por npm sin análisis.
- Se registra versión resuelta, dependencia que la introduce, aviso, alcanzabilidad, decisión, revisión y pruebas. Un falso positivo o una excepción requieren owner, evidencia, mitigación y fecha de vencimiento; no se ocultan con exclusiones globales.
- El gate requiere cero avisos críticos o altos de producción sin resolver y cero moderados alcanzables sin remediación o excepción vigente. Para los dos avisos conocidos de ws se exige resolver la versión afectada, no sólo una aceptación de riesgo.
- Instalación reproducible desde lockfile; análisis de producción en cada integración y análisis completo programado. Ningún job de análisis modifica dependencias o publica código por sí mismo. Secrets de aplicación y migración no se exponen al job de dependencias.

### D05 · Contexto de solicitud, errores y logging seguro

- Se crea una identidad de solicitud interna al ingresar y se la propaga a servicios, adaptadores y trabajo diferido. El contexto W3C entrante se valida con límites y política de confianza; nunca autoriza acceso ni se copia ciegamente como identidad interna.
- Se distinguen requestId, trace ID de telemetría y traceId de trazabilidad de negocio. Son conceptos distintos y deben tener nombres inequívocos en los registros.
- Los errores de validación, acceso, dominio, infraestructura, proveedor y programación tienen códigos estables y clasificación explícita. Los wrappers preservan cause y stack privadamente; se elimina la pérdida indiscriminada de causa al traducir errores SQL y HCS.
- Un boundary compartido publica únicamente mensajes seguros y registra una vez cada fallo inesperado. El trabajo posterior a la respuesta emite su propio resultado vinculado, sin volver a registrar como nuevo el mismo error capturado.
- El logger produce JSON con timestamp UTC, severity, service.name, service.version, environment, event.name, requestId y traceId/spanId cuando existan. Se agregan operación, ruta plantilla, duración, resultado y código mediante allowlist.
- La salida a stdout puede ser el transporte del logger estructurado; no se permiten llamadas console dispersas como estrategia de producción. La salida funcional de un CLI continúa siendo su contrato, separada de telemetría y sin falsos errores.
- La redacción se centraliza antes de cualquier exportación. Excluye tokens de sesión y CSRF, cookies, Authorization, contraseñas, claves, conexiones SQL, bytes firmados, contactos y parámetros sensibles. Conservar cause no autoriza serializar recursivamente errores Prisma o SDK crudos.
- 4xx esperables se registran como eventos de validación/admisión/acceso con nivel y muestreo adecuados. Un 5xx inesperado conserva evidencia diagnóstica segura. No se registran bodies completos.

### D06 · Tipado y modelo semántico

- Todo código propio, scripts, configuración y pruebas compila con strict, noUncheckedIndexedAccess y exactOptionalPropertyTypes. Se corrigen los 106 diagnósticos existentes sin excluir carpetas, debilitar reglas ni introducir casts o non-null assertions para silenciarlos.
- La ausencia de una propiedad y su presencia con undefined se modelan según contrato. Accesos indexados, argumentos CLI y resultados SQL comprueban su existencia.
- La operación se modela con discriminantes de estado y datos coherentes: estados previos sin asignación/recepción; asignación y retiro con comprador/viaje; recepción conforme con peso; rechazo con motivo; incidencia con peso y motivo. Los estados terminales también se validan al reconstruir desde SQL.
- La intención del frontend se modela por kind con campos requeridos en cada variante, en lugar de un grupo de opcionales independientes. Los estados de solicitud distinguen carga, respuesta confirmada, conflicto e incertidumbre.
- Se conservan readonly y contratos de dominio independientes del ORM. Los tipos semánticos de cantidades, dinero, identificadores y tiempos se introducen donde eviten intercambios incorrectos, sin branded types indiscriminados.
- Los bordes HTTP, entorno, DB JSON, mirror, archivos operativos y respuestas de frontend mantienen parsing runtime. Los casts de adaptación JSON/driver tienen un único límite justificado y no se presentan como validación de payload externo.
- Los switches sobre discriminantes se conservan si favorecen exhaustividad y narrowing. Se usan mapas para configuración y reglas repetidas; se elimina complejidad medida, no toda bifurcación por estilo.

### D07 · Contrato HTTP y compatibilidad

- Se publica OpenAPI 3.2 para las superficies reales, incluidos seguridad, schemas, límites, errores, headers, ejemplos seguros y estados asíncronos. El documento valida y se contrasta automáticamente con pruebas de comportamiento.
- Los errores adoptan application/problem+json con type, title, status y detail seguros, más code, requestId y traceId de telemetría cuando exista. instance, si se utiliza, no revela un identificador privado ni la topología. Errores de campo usan nombres permitidos y mensajes propios, sin valores ingresados.
- Los tres transportes de frontend aceptan el media type nuevo y validan éxito y error. Una respuesta desconocida no se convierte en éxito ni dispara una nueva intención. La transición modifica servidor y cliente de forma compatible o con una fase de negociación documentada.
- Las creaciones reales devuelven 201 y Location cuando el recurso sea consultable. Los trabajos aceptados devuelven 202 con enlace de estado; confirmar SQL nunca significa confirmar HCS. Un replay conservando el resultado puede agregar estado actual en campos diferenciados y documentados.
- Se versiona la superficie pública canónica como `/api/v1/traces/{traceId}` y sus subrecursos. Las rutas públicas previas siguen como adaptadores de compatibilidad, con las mismas políticas de admisión y sin duplicar lógica. Se declaran Deprecation, enlace de migración y, sólo con fecha acordada y consumidores medidos, Sunset. No se elimina la versión previa durante esta entrega.
- Las rutas BFF privadas pueden conservar el namespace actual porque se despliegan con su cliente, pero se incluyen en el contrato y el plan de rollout. Los comandos administrativos de cron y los comandos de reintento conservan sus excepciones semánticas explícitas; no se renombra todo por estética.

### D08 · Idempotency-Key y precondiciones sobre el recurso correcto

- Idempotency-Key utiliza el UUID de intención normalizado ya existente. Se conserva una sola fuente durable de hash y resultado. Durante compatibilidad puede admitirse el requestId de cuerpo; si ambos difieren, se rechaza con 400 antes de cualquier escritura. Misma clave con intención distinta devuelve 409.
- El namespace incluye propietario/agregado y operación según contrato. Cambiar de acción o evento con una clave ya usada no crea una segunda reserva. La retención y expiración del recibo se publican como parte del contrato.
- Se agrega un subrecurso privado de operación con GET y PATCH, cuya representación contiene la operación y su versión, sin cuotas o publicación externa mutable. PATCH aplica un documento de cambio de dominio con media type declarado y allowlist de acciones; no hace mass assignment ni permite escribir estado arbitrario.
- El ETag fuerte del subrecurso representa exactamente su contenido/versionado. PATCH exige If-Match; ausencia devuelve 428, mismatch devuelve 412, y una violación de transición o intención devuelve el código de dominio correspondiente. La condición se evalúa y aplica atómicamente después de autorizar propiedad y vigencia.
- Un recibo válido de la misma intención se resuelve antes de volver a aplicar la precondición: un replay no vuelve a escribir ni falla sólo porque su propia primera ejecución ya cambió el ETag. Su respuesta se identifica como replay y distingue la representación aplicada históricamente de la actual; antes de otra intención el cliente obtiene una lectura y un ETag vigentes.
- La respuesta de PATCH contiene la representación operativa y su nuevo ETag; los eventos y la publicación conservan sus contratos separados. El cliente migra a ese recurso. La entrada histórica de comandos y expectedVersion sigue como adaptador compatible, con su semántica de conflicto original y sin otra implementación de las reglas.
- Los ETag de representaciones que incluyan cuotas/publicación se calculan sobre toda la representación, no sólo sobre la versión operativa. Los GET condicionales devuelven 304 sin body únicamente después de validar acceso y vigencia. If-Match no compara un token de otro recurso por conveniencia.
- Los validadores HTTP no habilitan caché compartida: las representaciones privadas permanecen private, no-store y Vary Cookie; las públicas sensibles al vencimiento permanecen no-store mientras no exista otro presupuesto aprobado.

### D09 · Navegador, CSP y transporte

- Se define una política efectiva de CSP con script-src restrictivo, object-src none, base-uri, form-action y frame-ancestors; además de nosniff, Referrer-Policy y HSTS en el terminador HTTPS. No se agrega CORS abierto. Las excepciones para imágenes data del QR y estilos se justifican explícitamente.
- La política debe autorizar todos los scripts necesarios de Next, bootstrap de tema y datos estructurados por hash o nonce compatibles con la versión y bundler instalados. Se ensaya Report-Only y se exige enforcement para cerrar el requisito; un reporte sin política efectiva no lo satisface.
- Se prefiere autorización por hashes de build para contenido realmente estático, manteniendo la landing prerenderizable. Los subárboles dinámicos pueden usar nonce por solicitud si se requiere, con su costo de render documentado. Un hash sólo del bootstrap no es suficiente para toda la aplicación.
- La implementación debe demostrar la estrategia completa elegida. Si el framework impide conservar estática y una CSP estricta verificable, se registra el trade-off y se prioriza seguridad con una decisión de render explícita y medición del costo; no se usa unsafe-inline como solución general ni se declara cerrado por una política parcial.
- Se mantienen encoding de texto React, escape del JSON-LD y URLs remotas fijas sin redirects. No se incorpora HTML aportado por visitantes, uploads o fetch arbitrario.
- La CSP y los headers se comprueban en el build y nuevamente en la respuesta efectiva del candidato; no se infieren del código ni de valores de un panel.

### D10 · Ciclo de sesión y CSRF

- En HTTPS se migra a una cookie de sesión con prefijo __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ y sin Domain. El entorno HTTP local usa una política explícita separada. Si coexisten credenciales antiguas/nuevas ambiguas, se exige iniciar una sesión inequívoca; no se elige una al azar.
- Se conservan tokens opacos de 256 bits y hash en SQL. La migración tiene una ventana limitada: recuperación válida emite cookie nueva, elimina la antigua cuando corresponda y no cambia propiedad ni amplía el vencimiento absoluto.
- Se agrega revocación server-side y cierre de sesión idempotente mediante DELETE del recurso de sesión, con 204, protección CSRF y eliminación de cookie; una sesión ya terminada no se recrea al repetirlo. Se conserva la sesión necesaria para las relaciones históricas en lugar de borrar padres referenciados. Revocación invalida comandos, lecturas privadas y token CSRF; no altera la retención ni convierte en privados los enlaces públicos ya compartidos.
- Se incorpora inactividad máxima de 60 min, además de las 24 h absolutas. La actividad autorizada puede actualizar su marca como máximo una vez cada cinco minutos para reducir escrituras; el cálculo de vigencia usa tiempo de servidor. No se renueva indefinidamente el máximo absoluto. La UI advierte la política y retira datos privados al vencer.
- Se agrega un token CSRF sincronizado/vinculado a la sesión, recuperable de forma segura por una lectura same-origin y enviado mediante X-CSRF-Token en mutaciones autenticadas por cookie. Su diseño permite recarga sin crear sesión ni escribir por GET; no funciona como credencial de autenticación y no se guarda en localStorage ni logs. Su entrega deliberada al cliente usa no-store y no incluye el token opaco de autenticación.
- Inicio anónimo sin sesión utiliza Origin exacto, JSON, header custom, Fetch Metadata y admisión; después de existir sesión se requiere el token. El rechazo a metadata cross-site es explícito. Si el navegador no aporta metadata, sólo se admite mediante las demás defensas estrictas documentadas; su ausencia no saltea el token.
- La credencial de cron sigue independiente y con comparación segura. Rotar secretos no transfiere propiedad; credenciales revocadas o inválidas fallan cerradas. Login, cambio de privilegio y recuperación de cuenta no existen y no se inventan para cumplir requisitos de otro producto.

### D11 · Estrategia por ruta, entrega inicial y frescura

| Superficie | Lugar y momento | Frescura | Entrega e interactividad |
| --- | --- | --- | --- |
| Landing | Prerender de build y CDN cuando CSP lo permita | Escenario/copy ligados a la revisión publicada | HTML/RSC; formulario, tema y localizador cliente acotados |
| Demo: shell | Prerender elegible, sin credencial serializada | Revisión publicada | HTML y panel cliente |
| Demo: estado privado | API Node cerca de SQL; mount, acción y refresh explícito | Última lectura; desde 60 s se marca antigua y se exige actualizar antes de escribir | JSON privado; cancelación y precondición server-side obligatoria |
| Trazabilidad: historial inicial | Origin Node y SQL compartido, antes de entregar status | Lectura inicial actual; no caché pública de datos | HTML/RSC con contenido útil sin JS; controles de contraste/QR cliente |
| Contraste por hito | API Node y mirror por acción explícita | Evidencia puntual con observedAt; desde cinco minutos se identifica como observación anterior | Respuesta acotada, sin polling; no sustituye confirmación histórica |
| QR | Browser, import diferido | Enlace válido hasta vencimiento de recorrido | PNG con geometría reservada y enlace textual siempre disponible |

- El historial inicial usa el mismo servicio de consulta y proyección que HTTP; el servidor no llama a su propia API. La nueva entrada server-side mantiene validación, presupuesto de lectura y admisión para evitar bypass del límite público. Las navegaciones y prefetches no generan escrituras de negocio ni acceso a HCS.
- Antes de enviar el shell de trazabilidad se decide UUID inválido/inexistente, vencimiento y fallos de servicio. Se exige 404, 410 o 503 reales según corresponda, además de contenido seguro. Si las primitivas de página del runtime no pueden expresar un status requerido, se resuelve en una frontera HTTP previa compatible con el framework; no se responde 200 con un aviso y se lo llama 410.
- Se incorpora observedAt a lecturas y estado de frescura comprensible. No se promete actualización en vivo. Los lectores pueden pedir refresh manual; la publicación diferida no exige mantener abierta una request durante minutos.
- Se usan boundaries y skeletons de secciones completas cuando haya espera real, con geometría comparable al resultado. No se agregan micro-boundaries ni se supone que loading por sí solo entrega datos vía streaming.
- No se serializan secretos de infraestructura, credenciales de autenticación ni PII ajena. El token CSRF destinado al formulario sigue la entrega privada de D10. Se revisan renders iniciales para eliminar divergencias de reloj/azar; la excepción de html para el tema permanece acotada y documentada, no se extiende para ocultar otros mismatches.

### D12 · Rendimiento y presupuestos del navegador

- Objetivos de campo por ruta plantilla y clase móvil/escritorio: LCP p75 ≤2,5 s, INP p75 ≤200 ms y CLS p75 ≤0,1. Ventana móvil de 28 días, al menos 200 muestras válidas por métrica/cohorte para emitir un veredicto; con menos datos se informa evidencia insuficiente. No se mezclan rutas rápidas con lentas para ocultar regresiones.
- Gate de laboratorio: tres corridas del mismo build de producción por ruta y perfil móvil acordado; mediana LCP ≤2,5 s, CLS ≤0,1 y TBT ≤250 ms, además de no empeorar más de 20 % una base comparable salvo cambio aprobado y justificado. TBT es diagnóstico de laboratorio, no aprobación de INP.
- Se mide JS transferido comprimido para la carga inicial: presupuesto inicial landing 200 KiB, demo 300 KiB y trazabilidad 250 KiB. Se excluyen mapas de fuente y módulos diferidos no solicitados; se incluyen framework y módulos efectivamente requeridos. El QR se mide también como carga diferida. Si una restricción del runtime obliga a excederlos, se optimiza primero y se registra una decisión basada en medición, sin cambiar el umbral para hacer pasar el gate silenciosamente.
- Se conservan imagen crítica optimizada con dimensiones/sizes/prioridad, fuente local con fallback compatible y espacio fijo de QR. Se mide antes de separar componentes o schemas; no se crea un waterfall de imports/fetches para bajar una cifra aislada.
- RUM captura sólo métricas y contexto mínimo: ruta plantilla, versión, entorno, navegación y clase de dispositivo. No envía URL arbitraria, UUID del recorrido, contacto, body, cookie o query libre. La recepción de telemetría tiene validación, límites y presupuesto propio; no crea eventos de dominio ni una nueva vía de abuso.

### D13 · Trazas, métricas y operación

- Se instrumentan HTTP, SQL, llamadas HCS/mirror y ejecución diferida mediante OpenTelemetry o la integración compatible del runtime. W3C traceparent/tracestate se propagan con validación y límites, sin convertir baggage externo en etiquetas o contexto privado confiable.
- Se correlaciona el trabajo posterior al commit y el cron mediante parent/link apropiado. La outbox conserva el contexto mínimo necesario cuando la ejecución ocurra otro día; nunca cookies, tokens, PII o headers arbitrarios. Un cron no inventa una relación padre con una solicitud ya inexistente si corresponde usar links.
- Métricas RED: solicitudes y errores por método/ruta plantilla/clase de status, e histogramas de duración para calcular p50/p95/p99. Saturación/USE: espera/rechazos/conexiones del pool, event loop, memoria y capacidad externa. Negocio/operación: acciones guardadas, replays, conflictos, cupo HCS, antigüedad de pendiente, incertidumbre, cron y limpieza.
- Labels permitidos son vocabularios cerrados; IDs de usuario, request, span, lote o recorrido, emails, URLs completas y mensajes de error no son labels. La cardinalidad efectiva se comprueba con datos de muchos identificadores.
- El pipeline tiene límites de cola, tamaño, muestreo y presupuesto; falla sin bloquear la operación y sin buffers ilimitados. Se establecen retención y acceso a telemetría compatibles con minimización y presupuesto cero. No se contrata un colector pago; la evidencia del exportador efectivo es requisito del cierre operativo.
- Los error boundaries y vistas 500/503 muestran referencia investigable sin excepción privada. Se diferencian 403, 429 y 503; Retry-After se informa cuando haya un plazo razonable, no se fabrica una fecha de recuperación de un proveedor desconocido.

### D14 · SLIs, SLOs, alertas y salud

| Capacidad | Objetivo inicial | Medición y exclusiones |
| --- | --- | --- |
| Guardar/leer localmente dentro de capacidad | 99,5 % de solicitudes elegibles sin 5xx en 28 días | Se excluyen sólo entradas inválidas, acceso denegado y límites documentados; los 503 inesperados y timeouts cuentan como fallos. Se reporta aparte cuánto tráfico legítimo se rechaza por capacidad. |
| Latencia de SQL/API local caliente | p95 ≤750 ms y p99 ≤1.500 ms | Build de producción, concurrencia 8, dataset representativo y sin incluir espera HCS posterior al commit. Medir también arranques fríos por separado. |
| Contraste remoto | Presupuesto completo ≤10 s | Dependencia controlada para regresión; se mide disponibilidad real del proveedor separadamente. Un timeout devuelve estado explícito y conserva la historia. |
| Mantenimiento esperado | Ejecución observada dentro de 36 h y progreso verificable | No se considera sano sólo porque el endpoint responde; se observa fecha, categorías y backlog. |
| Publicación elegible | 99 % atendido dentro de 36 h con configuración, red y cuota disponibles | Se reportan también edad total y causas excluidas; cooldown o cuota no ocultan el tiempo real de espera al visitante. |
| Eliminación física | ≤36 h en operación normal | Retención lógica permanece inmediata al vencer; se alertan demoras físicas. |

- Son objetivos de ingeniería propuestos, no SLA contractuales de Vercel, Neon o Hedera. Deben medirse en el candidato; si el entorno gratuito no los sostiene, se limita admisión o se registra la imposibilidad. No se declara cumplimiento por bajar un objetivo sin revisión.
- Error budget derivado del SLO de disponibilidad: 0,5 % de solicitudes elegibles en la ventana. Alertas propuestas de burn rate: 14,4× con ventanas de 1 h/5 min y 6× con 6 h/30 min; requieren volumen suficiente y owner. Bajo tráfico se complementa con fallos consecutivos, pruebas sintéticas acotadas y atraso del cron.
- Cada alerta tiene owner operativo, canal realmente configurado, severidad, síntoma, condición de resolución y runbook de diagnóstico/recuperación. Sin destino probado no se acredita alerta activa. Las herramientas no envían mensajes a terceros durante la fase de especificación.
- Liveness es liviana y no consulta DB/HCS. Readiness tiene timeout y sólo incluye dependencias que impidan realmente atender su tipo de tráfico; HCS caído no invalida la capacidad de persistir localmente. Startup sólo se implementa si el entorno de ejecución la utiliza; la excepción serverless se documenta.
- Las sondas no publican versiones de infraestructura, credenciales ni topología. Las comprobaciones profundas son privadas y acotadas. Un fallo de readiness no debe generar un circuito de reinicios de instancias sanas.

### D15 · Presupuesto temporal, cancelación y resiliencia

- Cada operación remota y espera de pool tiene timeout dentro de un presupuesto completo. Se conserva como referencia SQL de 5 s por transacción y 2 s de espera, pero se verifica que la suma de varias ventanas y red no exceda el límite del request o trabajador. Un timeout por dependencia no sustituye al deadline total.
- La lectura de cuerpos acota bytes, tiempo y cancelación incluso sin Content-Length confiable. El ingreso y runtime se configuran y prueban para clientes lentos; no se asume protección por una función que sólo cuente bytes.
- Se propagan aborts de lecturas cuando el runtime y driver lo soporten. Cancelar una request de mutación después de una posible escritura no se interpreta como rollback ni autoriza otro ID: se conserva incertidumbre e idempotencia.
- La elegibilidad de retries transitorios usa backoff con jitter acotado sin acortar cooldowns mínimos, vencimiento ni límites 3+1. La dispersión se inyecta en pruebas por una frontera de política, no mediante sleeps largos o reloj real.
- Se limita concurrencia externa antes de preparar mensajes o contrastar repetidamente. Se propone un lease de admisión compartido de capacidad externa distinto del lease de cada publicación, reutilizando coordinación SQL, con expiración/fencing. La cantidad se obtiene del ensayo y presupuesto del proveedor; inicialmente máximo dos llamadas costosas en vuelo globales. No se mantiene una transacción SQL abierta mientras se usa el permiso externo.
- Un breaker compartido se incorpora sólo si el ensayo de caída demuestra que límite, pausa y rechazo temprano no protegen suficientemente; en ese caso tiene estados, pruebas de recuperación y owner explícitos. No se exige Redis ni una librería de circuit breakers por ceremonia.
- Se preserva reconciliación de transacciones inciertas y orden de hitos. Toda optimización de concurrencia debe demostrar que no habilita duplicados o adelantamientos.

### D16 · Prisma, queries y consistencia

- Se conserva singleton lazy y reutilización de warm instances. Las solicitudes no crean ni desconectan Prisma. El CLI cierra su propio cliente al terminar.
- Se reemplazan includes amplios en replay/proyecciones por selects mínimos, evitando cargar bytes firmados e historial donde no se usan. No se exponen modelos generados como DTOs públicos ni se agregan repositorios passthrough.
- El cálculo de bloqueos del historial puede pasar a una sola recorrida para evitar crecimiento cuadrático si simplifica la implementación; n≤5 no se usa como argumento para una optimización invasiva sin beneficio.
- Exportación sigue usando cursor, orden estable y páginas acotadas con escritura esperada. Un índice de exportación o de elegibilidad sólo se agrega después de comparar planes, lecturas y costo de escritura con volumen realista. TypedSQL es opcional si aporta contratos; SQL raw continúa parametrizado y sin input arbitrario en fragmentos estructurales.
- Se alinean checks SQL con invariantes de estado y sesiones nuevas mediante migraciones posteriores. Los JSON históricos se validan antes de hacer un backfill; una inconsistencia bloquea o se pone en cuarentena documentada, sin fabricar pesos, motivos ni evidencia.

### D17 · Capacidad global y localidad

- Se documenta el límite real del proveedor y el cálculo de conexiones cliente: máximo de instancias simultáneas por dos conexiones, más CLI/migración/reserva. Se distingue la capacidad cliente del pooler y sus conexiones backend a PostgreSQL.
- Se registran región de función y DB, latencia entre ambas, soporte del pooler a parámetros requeridos y reserva operativa. No se mueve render al Edge lejos de SQL ni se sube el pool por intuición.
- El ensayo utiliza build de producción, dataset al menos equivalente a S21 y carga en el techo de admisión previsto, con arranque frío separado de estado caliente. Incluye saturación, rechazos, memoria y espera de pool. No se acredita capacidad con Next dev o sólo promedio.
- Si los límites del proveedor o su escala de instancias no permiten acreditar un techo seguro, se configura protección en el ingreso/pooler disponible gratuitamente o se mantiene bloqueada la aceptación de capacidad. Dos conexiones por instancia no se presentan como un límite global.

### D18 · Migraciones, rollout y recuperación

- Se aplican cambios con migrate deploy desde un único runner autorizado, con conexión administrativa separada y verificación de checksums. No hay migrate dev, db push o migraciones durante el build de aplicación de producción.
- Evolución expand → backfill en lotes → switch → contract: primero estructuras compatibles de sesión, admisión, telemetría mínima e invariantes; luego backfill reanudable de datos existentes; después código y contratos nuevos; eliminación de compatibilidad sólo en otra entrega con evidencia de consumidores.
- DDL y backfills definen lock timeout, presupuesto, progreso, reanudación y procedimiento ante fallo. Se ensaya con aplicación anterior y nueva coexistiendo. No se reescribe ninguna migración aplicada para hacerla pasar.
- Rollback de código no equivale a rollback de escrituras ni de HCS. El plan conserva campos aditivos/recibos necesarios y reconcilia la misma identidad externa. Antes de un contract se demuestra que la versión anterior ya no es un candidato válido de rollback.
- Se verifica mínimo privilegio de ejecución, separación efectiva del migrador, TLS con nombre/certificado validados, política de red, pooling y backup/restore. Una variable pooled y otra directa no prueban permisos distintos.
- La restauración se ensaya en recurso aislado con datos sintéticos y compara estado operativo, payloads, digests e identidades de intentos. RPO/RTO se declaran a partir de lo que el plan gratuito realmente permite; ausencia de backup o restore remoto verificable deja recuperación pendiente, no se inventa una garantía.

### D19 · Puertas de calidad y documentación

- Se configura un único linter principal compatible con el stack para código, React/hooks y seguridad de tipos; no se instalan ESLint y Biome duplicando reglas sin motivo. Formato y lint tienen comandos explícitos y no reparan archivos silenciosamente en CI.
- La puerta de integración incluye instalación reproducible, generación/validación Prisma sin tocar una base habitual, perfil TypeScript completo, lint, contrato OpenAPI, API, CLI, tokens/UI y build. E2E y laboratorio de producción se ejecutan para frontend/contratos/rendimiento y en el gate de release completo.
- Se añaden pruebas nuevas junto a cada corrección durante la futura implementación; las restricciones históricas que reservaban suites para S17/S18 no impiden ahora extender las suites existentes. No se crean tests ni código funcional durante esta fase de spec.
- El runner de pruebas usa clústeres, secretos y ledger controlado aislados; el runner de migraciones del candidato es distinto y requiere autorización operativa previa. Ningún job de fork/PR no confiable recibe secretos de producción.
- Se exige documentación de porqué, trade-offs, invariantes, budgets, errores y operación en español rioplatense. No se obliga a comentar cada función ni a traducir identificadores estándar. Código compacto se expande cuando dificulte entender el flujo.

### D20 · Secuencia de entrega y habilitación

1. **S22-A · Protección y sostenibilidad:** D02–D04, D15 y cambios SQL aditivos necesarios. Cierra los riesgos de admisión, retención y dependencia; incluye pruebas de abuso, caídas y recuperación del atraso.
2. **S22-B · Contratos y diagnósticos:** D05–D08, D16 y D19. Completa tipos, invariantes, logging, Problem Details, OpenAPI y precondiciones; mantiene adaptadores para clientes anteriores.
3. **S22-C · Navegador y experiencia:** D09–D12 y ciclo de sesión D10. Completa CSP efectiva, cookie/CSRF, frescura, trazabilidad inicial útil sin JS y budgets de frontend.
4. **S22-D · Operación demostrada:** D13–D14, D17–D18 y cierre D21. Instrumenta el conjunto, ejecuta carga/rollout/restore y verifica entorno/campo.

Las entregas pueden solaparse sólo cuando sus dependencias están disponibles y cada cambio mantiene las invariantes. Ninguna fase se declara terminada únicamente por añadir documentación. No se usa un flag para habilitar tráfico público a controles nuevos incompletos. La publicación de esta spec no autoriza despliegue, recursos remotos ni mensajes HCS reales.

### D21 · Definition of Done y evidencia de cierre

| Bloque | Criterio obligatorio |
| --- | --- |
| JSTS | Cero errores con los tres flags en todo código propio; cero any/assertions injustificados; estados semánticos validados; recursos y causes conservados; lint y regresión completos. |
| Rendering | Cinco ejes y budgets implementados por ruta; historial inicial sin JS; status reales; ausencia de hydration mismatches; geometría y bundle dentro del gate; RUM suficiente con metas de campo o estado externo pendiente explícito. |
| API | Contrato OpenAPI válido y contrastado; Problem Details soportado por clientes; idempotencia/precondiciones verificadas; límites durables completos; deadlines y trabajo diferido seguros; evolución compatible. |
| Prisma | Singleton/adapter y pool comprobados; proyecciones mínimas; invariantes SQL; transacciones sin red; limpieza convergente; migración/rollback compatibles y recovery ensayado. |
| Seguridad | Avisos conocidos de ws resueltos; política de dependencias cumplida; cookie/CSRF/revocación e aislamiento efectivos; CSP/headers efectivos; ausencia de PII/secretos en públicos y telemetría; permisos/TLS remotos verificados. |
| Observabilidad | Referencia pública reconstruible; contexto W3C/logs JSON y causas seguras; RED/USE/negocio con cardinalidad acotada; salud coherente; SLO/error budget, alertas y runbooks operativos comprobados. |

- Cada control registra estado: comprobado localmente, comprobado en candidato, comprobado en campo, parcial, pendiente o no aplicable justificado. Incluye historias, decisión, prueba, resultado, revisión/fingerprint, fecha, entorno y limitaciones. Un pendiente no se convierte en aprobado por falta de acceso.
- Se exige cierre de todos los AUD-01–AUD-17 aplicables. Un hallazgo considerado inaplicable requiere explicación y evidencia de la condición, no sólo una marca NA. Cualquier excepción de seguridad o presupuesto es temporal, con owner y vencimiento; no sustituye un requisito obligatorio de esta spec.
- Se distinguen **implementación completa**, **verificación local aprobada** y **aceptación operativa global**. Las dos primeras pueden completarse antes de publicar; la tercera requiere candidato, proveedor y datos de campo suficientes. No se declara el sistema profesionalmente aceptado mientras falte evidencia obligatoria.

## Testing Decisions

### Fronteras y criterios

- Frontera principal: API HTTP de la aplicación contra Next real y SQL descartable; conserva la frontera ya confirmada para reglas, persistencia observable, seguridad, concurrencia, cuotas y estado HCS. El reloj y el proveedor externo se controlan en las composiciones existentes, sin ramas de simulación accesibles en producción.
- Frontera complementaria: navegador sobre las rutas reales para carga inicial, hidratación, contratos cliente, CSRF/cookies, frescura, accesibilidad, geometría y budgets. HTTP sin JavaScript verifica documento/status/cabeceras. No se repite cada combinación de validación de API en E2E.
- CLI: se mantienen las fronteras públicas de exportación, diagnóstico, migración y recuperación autorizados. Build, compilador, linter y contrato verifican sus propios artefactos. No se añade una capa de mocks de funciones privadas.
- Telemetría se observa mediante un colector/exportador de prueba con la misma interfaz externa de producción y recursos aislados. Es una salida del sistema, no una nueva API pública de diagnóstico. Los tests no espían llamadas privadas de logger o repositorios.
- Un buen test ejercita un comportamiento visible, una invariante o un límite real; falla si el control se rompe y tolera refactorizaciones internas. Pruebas de reloj usan avance controlado; pruebas de fallos verifican estado posterior y ausencia de efectos parciales. Carga no se confunde con test funcional ni con promesa del proveedor.
- Prior art: suites de recorrido, publicación, persistencia, seguridad, contactos/consulta, CLI, tokens UI, navegador y SEO de producción existentes. Se extienden los casos de idempotencia, roles, leases, TLS, migración aditiva, backup y aislamiento en lugar de crear otro arnés paralelo.

### Matriz de aceptación ejecutable

| Caso | Frontera | Comportamiento que debe demostrar |
| --- | --- | --- |
| S22-01 | HTTP + dos instancias | Todos los puntos de entrada consumen la política correcta; no hay bypass por cookie, Origin falsificado por un programa, ruta de compatibilidad o entrada SSR nueva. |
| S22-02 | HTTP + SQL aislado | Cientos de claves distintas respetan límites de solicitud/intención; la primera rechazada no agrega recibo, estado, evento ni cupo de negocio. |
| S22-03 | HTTP | Replay idéntico conserva resultado y reserva; cambio de acción/payload/header da 409 o 400 según contrato; una sesión ajena no recupera el recibo. |
| S22-04 | HTTP + reloj | 429/503 incluyen contrato seguro y Retry-After razonable; después de la ventana se recupera capacidad sin alterar intención o cupos. |
| S22-05 | HTTP/CLI + reloj | A carga diaria máxima, limpieza de múltiples tandas progresa por categoría y sostiene retención. Siete días de interrupción convergen en tres ejecuciones exitosas según D03. |
| S22-06 | HTTP/CLI + SQL aislado | Máximo de hijos por recorrido, leases activos, caída entre tandas y cascadas grandes respetan presupuesto y reanudación, sin borrar evidencia vigente. |
| S22-07 | Instalación + análisis | Lockfile reproducible, ws resuelto fuera de rangos afectados y política de advisories satisfecha sin downgrade/force no revisado. |
| S22-08 | HTTP + colector de prueba | Un error SQL y otro de programación generan una referencia pública y un diagnóstico correlacionado seguro; preservan causa útil sin query, PII o conexiones. |
| S22-09 | HTTP/worker + colector | Solicitud, commit, trabajo diferido y cron tienen parent/link correcto, códigos y duración; no se registran dos veces como fallos independientes. |
| S22-10 | Compilador/lint | Tres flags en todas las áreas, cero diagnósticos y cero escapes nuevos; una infracción real de lint o tipos bloquea CI. |
| S22-11 | HTTP + migración | Estados terminales/incompletos y snapshots corruptos se rechazan; caminos válidos y recibos históricos siguen reconstruyéndose sin fabricar datos. |
| S22-12 | HTTP + contrato | OpenAPI describe exactamente headers, schemas, permisos, errores y compatibilidad; aplicación/problem+json es entendido por todos los transportes. |
| S22-13 | HTTP concurrente | Dos PATCH al mismo ETag generan un solo cambio; el otro devuelve 412. Falta If-Match da 428; replay y versión antigua conservan reglas idempotentes. |
| S22-14 | HTTP | ETag representa el recurso completo; If-None-Match da 304 sin body sólo después de autorizar vigencia. Cambios de publicación/cuota no reutilizan indebidamente un ETag operativo. |
| S22-15 | HTTP + navegador producción | CSP/headers efectivos, bloqueo de frame/script no autorizado y funcionamiento de scripts legítimos, tema, navegación, formulario y QR. Sin unsafe-inline general. |
| S22-16 | HTTPS + navegador | Cookie __Host- con atributos, migración inequívoca, credencial inaccesible a JS/storage, cierre idempotente y rechazo de credenciales revocadas. |
| S22-17 | HTTP + reloj/navegador | Vencimientos absoluto/idle exactos; marca de actividad acotada no amplía máximo; refresh o replay no reviven una sesión. UI retira vista privada. |
| S22-18 | HTTP + navegador | CSRF ausente, incorrecto o de otra sesión; Origin cruzado; Sec-Fetch cross-site y metadata ausente según política: rechazo sin efectos. Bootstrap anónimo conserva la defensa definida. |
| S22-19 | HTTP sin JS + navegador | Historial inicial útil, 404/410/503 reales antes del shell, ningún fetch servidor→API propia y ningún envío HCS al navegar o prefetchear. |
| S22-20 | Navegador + reloj | Desde 60 s se marca estado privado antiguo y se pide refresh antes de escribir; observaciones de cinco minutos se etiquetan; sin polling ni pérdida de datos. |
| S22-21 | Build + navegador | Sin hydration mismatches ni suppressHydrationWarning nuevo para ocultarlos; skeletons/recursos reservan geometría en móvil/escritorio y temas. |
| S22-22 | Laboratorio + bundles | Tres corridas por ruta cumplen D12, con samples íntegros y comparación válida. Un exceso bloquea el gate sin reinterpretar TBT como INP. |
| S22-23 | Navegador + recepción RUM | Eventos mínimos válidos, límites de ingesta y rechazo de etiquetas arbitrarias; ninguna URL/UUID/PII sale como dimensión. Informe p75 no aprueba cohortes insuficientes. |
| S22-24 | HTTP/carga + proveedor controlado | Deadline total, cuerpo lento, cancelación, dependencia caída y concurrencia externa conservan capacidad y rechazan temprano sin consumir trabajo ilimitado. |
| S22-25 | HTTP/cron + reloj | Jitter respeta cooldown y máximo 3+1; caída después de envío reconcilia la misma transacción; lease viejo no confirma ni libera a su sucesor. |
| S22-26 | Colector + carga | Métricas RED/USE/negocio calculan percentiles y atraso; muchos identificadores no multiplican labels; fallo del exportador no bloquea la operación ni crea cola ilimitada. |
| S22-27 | HTTP + monitoreo | Liveness no consulta DB; readiness distingue SQL de HCS y usa timeout; alertas de cron ausente, atraso y burn rate llegan al destino configurado con runbook y owner. |
| S22-28 | Build/carga | Pool/instancias y localidad cumplen D17; se miden cold/warm, espera, memoria, p95/p99 y rechazos bajo límites reales, sin extrapolar Next dev. |
| S22-29 | CLI + dos versiones | Expand/backfill/switch, runner único, caída/reanudación, checksums y coexistencia no bloquean ni rompen clientes históricos. No se editan migraciones aplicadas. |
| S22-30 | CLI + entorno aislado/proveedor | Restore preserva estado, payload, digest e identidad externa; grants/TLS/pooler/backup efectivos tienen evidencia propia. Un restore SQL no se presenta como reversión de HCS. |
| S22-31 | CI + release | Un fallo de tipos, lint, contrato o suite requerida bloquea integración/release; PR no confiable no recibe secretos ni aplica migraciones. |
| S22-32 | Matriz de evidencia | Las 17 brechas y seis DoD tienen resultado y fuente de la misma revisión; faltantes externos o de campo quedan pendientes, no aprobados por omisión. |

- Cada corrección incorpora casos negativos y de recuperación que justifiquen su comportamiento. No es obligatorio crear 32 archivos ni una prueba por línea de la tabla: un escenario puede acreditar varios controles si su evidencia es inequívoca.
- Pruebas remotas se ejecutan sólo con candidato explícito, recursos aislados y autorización operativa. Se preserva la distinción entre ledger controlado y cinco hitos reales contrastados; no se contacta HCS para escribir esta spec.

## Out of Scope

- Implementar código funcional, instalar dependencias, aplicar migraciones, crear commits/PRs, aprovisionar, desplegar o enviar mensajes reales durante esta fase documental.
- Usuarios empresariales, multi-tenancy, passwords/Argon2id, MFA, OAuth/OIDC, JWT y recuperación de cuentas: no existen en el producto actual. Si se incorporan, requerirán una spec de identidad y autorización con sus propios invariantes; no se acredita su seguridad marcándolos como implementados aquí.
- Pagos, mainnet, wallets, tokens ambientales, GPS, IA, uploads, HTML aportado por usuarios o sincronización offline completa.
- Adoptar microservicios, servidor Node dedicado, Redis, colas externas, workers CPU o Edge por una checklist sin necesidad medida. El trabajo actual no demuestra CPU intensiva que justifique worker_threads.
- Modificar diseño de negocio, economía ilustrativa o significado de eventos históricos; normalizar o borrar evidencia para hacer pasar migraciones.
- Pagar plataformas de observabilidad, contratar planes, agregar tarjetas o activar upgrades automáticos. Si no existe una alternativa gratuita verificable, se declara el bloqueo operativo correspondiente.
- Certificar cumplimiento ISO/IEEE/OWASP/ASVS a partir de esta spec o de una suite local. La aceptación se limita a los controles efectivamente implementados y demostrados.

## Further Notes

### Trazabilidad de los 17 hallazgos

| Hallazgo | Decisiones | Evidencia mínima de cierre |
| --- | --- | --- |
| AUD-01 · admisión incompleta | D02, D15, D17 | S22-01–04, 24, 28; límites efectivos y ausencia de crecimiento arbitrario de recibos. |
| AUD-02 · capacidad de limpieza | D02–D03, D14, D16 | S22-05–06, 27; volumen admitido compatible, atraso convergente y eliminación física observada. |
| AUD-03 · dependencia afectada | D04, D19 | S22-07, 31; árbol resuelto y análisis vigente. |
| AUD-04 · diagnóstico y causa | D05, D13 | S22-08–09; error investigable y telemetría saneada. |
| AUD-05 · perfil TypeScript | D06, D19 | S22-10–11; cero diagnósticos con tres opciones en todo el proyecto. |
| AUD-06 · CSP/headers | D09, D11 | S22-15, 19, 21; política efectiva y framework funcional. |
| AUD-07 · contrato HTTP | D07–D08 | S22-12–14; Problem Details, OpenAPI, headers y compatibilidad verificables. |
| AUD-08 · gate integral | D19–D20 | S22-10, 31; bloqueo automático real ante regresión. |
| AUD-09 · operación medible | D05, D13–D14 | S22-08–09, 26–27, 32; pipeline, objetivos, salud y alerta probados. |
| AUD-10 · render/frescura/status | D11 | S22-19–21; datos iniciales, status reales y presupuesto de antigüedad. |
| AUD-11 · CWV/JS | D12 | S22-22–23; gate de laboratorio y p75 de campo suficiente. |
| AUD-12 · pool global | D14, D17 | S22-28; capacidad y región del proveedor acreditadas. |
| AUD-13 · sesión/CSRF | D10 | S22-16–18; host cookie, expiración, revocación y mutaciones protegidas. |
| AUD-14 · estados inválidos | D06, D16, D18 | S22-11, 29; modelo, parsing e invariantes persistidas compatibles. |
| AUD-15 · proyecciones/queries | D16–D17 | S22-28 y regresión de replay/exportación; menos datos innecesarios y planes medidos. |
| AUD-16 · claridad/documentación | D06, D19 | Revisión de reglas, comentarios y contratos; lint y regresión sin abstracciones ceremoniales. |
| AUD-17 · resiliencia conjunta | D03, D14–D15 | S22-24–25, 27; deadlines, capacidad externa, recuperación y no duplicación. |

La auditoría de referencia encontró typecheck actual aprobado, 106 diagnósticos con las dos opciones adicionales, 43 pruebas API aprobadas, 19 de CLI y dos de tokens UI. Esas cifras describen la revisión base; no son aprobación de S22 ni se reutilizan como resultado posterior sin fingerprint compatible.

Los rangos RENDER-01–30, API-01–25, PRISMA-01–35 y OBS-01–40 no venían acompañados por la definición individual de cada antipatrón. Se cubren los controles descriptos en los seis bloques y los hallazgos concretos, sin inventar numeraciones equivalentes. Los IDs de pruebas API históricas pertenecen al proyecto y no al catálogo del pedido.

Se mantienen las fronteras HTTP y navegador confirmadas en el plan previo y extendidas por S21, más CLI y artefactos de build ya existentes. No se introduce una frontera de prueba de funciones privadas ni se reabre una entrevista de producto.

Publicación de tracker pendiente de configuración. La habilidad to-spec requiere un tracker identificado y la etiqueta ready-for-agent; la documentación vigente del proyecto conserva ese paso pendiente. Ejecutá `/setup-matt-pocock-skills` para configurarlo. Después se publica esta spec como unidad de trabajo con esa etiqueta, sin presentar como implementación terminada ninguna fase S22. La rama documental no implica commit, push ni despliegue.
