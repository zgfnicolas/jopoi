# S21 · Revisión y mejoras de API, sesiones, concurrencia y base de datos

Fecha: 2026-10-29. Base inspeccionada: commit `2b32599`, sin cambios previos en el árbol de trabajo.

Estado: implementación local de S21 con límites compartidos, auditoría SQL, política TLS/UTC y verificaciones de seguridad, concurrencia y recuperación. Resultados ejecutados y pendientes de aceptación en [validación S21](../s21-validacion.md). El diagnóstico inicial que sigue conserva la observación previa a la implementación y no equivale al estado posterior. La evidencia local no acredita configuración ni aceptación del proveedor. Publicación pendiente de configuración del tracker. Etiqueta prevista: `ready-for-agent`, todavía no aplicada.

## Problem Statement

El responsable de Jopói necesita saber si la API, la autenticación y autorización, las sesiones, el trabajo en segundo plano y PostgreSQL están implementados correctamente. La presencia de cookies, índices o transacciones no alcanza para demostrar seguridad, integridad ni velocidad bajo concurrencia o fallos.

La demo usa sesiones anónimas y roles simulados de generador, coordinador, transportista y comprador. Debe distinguirse la posesión de una sesión de la identidad de una persona o empresa, y la selección de un rol de un permiso empresarial real. También debe distinguirse el token opaco de sesión actual de un sistema de access y refresh tokens, que no se encontró implementado.

Sin una matriz de evidencia y criterios de aceptación se corre el riesgo de declarar cumplimiento global sin medirlo, incorporar mecanismos innecesarios o eliminar snapshots y registros históricos por considerarlos duplicación accidental.

## Solution

Auditar el comportamiento actual y corregir brechas demostradas conservando los contratos y el alcance de la demo. Entregar una matriz por control con estado, evidencia reproducible, impacto, prioridad, corrección y verificación posterior. Los estados serán: comprobado, parcial, ausente requerido, no aplicable justificado y pendiente de evidencia externa. Una observación estática se identificará como tal y no equivaldrá a una prueba ejecutada.

Mantener como frontera principal la API HTTP real con PostgreSQL exclusivo de pruebas; complementar con navegador para cookies, vencimiento y recuperación visibles. Se reutilizan las fronteras previamente confirmadas y el arnés de integración existente. Para controles que HTTP no puede demostrar se admiten verificaciones acotadas del catálogo SQL, privilegios efectivos, conexión y planes de ejecución, sin crear interfaces públicas de diagnóstico.

El resultado debe responder por separado qué ya está implementado, qué se comprobó ejecutando pruebas, qué requiere corrección, qué no corresponde al prototipo y qué depende del entorno desplegado.

## User Stories

1. Como responsable de Jopói, quiero una matriz de controles con evidencia, para saber qué buenas prácticas se cumplen y con qué límites.
2. Como responsable de Jopói, quiero priorizar brechas por impacto y reproducibilidad, para corregir primero los problemas que afectan acceso, integridad o disponibilidad.
3. Como visitante, quiero comenzar una sesión anónima sin crear una cuenta, para explorar la demo dentro de su alcance actual.
4. Como visitante, quiero que la credencial de mi sesión viaje en una cookie HttpOnly, para evitar su lectura mediante las APIs de JavaScript del navegador.
5. Como visitante, quiero que la cookie use Secure en producción y una política SameSite explícita, para restringir su transporte y envío entre sitios.
6. Como visitante, quiero que mi credencial no aparezca en URLs, respuestas JSON, almacenamiento accesible a JavaScript ni logs, para reducir su exposición.
7. Como visitante, quiero que el servidor compruebe la vigencia de mi sesión, para que conservar una cookie vencida no permita continuar operando.
8. Como visitante, quiero que recargar la página recupere mi recorrido vigente, para continuar sin consumir otro cupo.
9. Como visitante, quiero que iniciar una sesión nueva no recupere recorridos ajenos, para preservar el aislamiento.
10. Como propietario de un recorrido, quiero que cada lectura y escritura privada compruebe propiedad y vigencia, para impedir acceso mediante identificadores conocidos.
11. Como visitante ajeno, quiero recibir respuestas consistentes al consultar recursos privados, para que sus errores no revelen información del propietario.
12. Como participante de la demo, quiero que los roles se identifiquen como simulados, para no confundirlos con autenticación empresarial.
13. Como responsable, quiero documentar la pertinencia de access y refresh tokens, para evitar atribuir a la demo un mecanismo que no utiliza.
14. Como responsable, quiero conocer cómo se invalida una sesión y qué ocurre al rotar secretos, para entender el alcance de recuperación ante exposición.
15. Como visitante, quiero que las mutaciones comprueben el origen autorizado, para reducir solicitudes inducidas desde otro sitio.
16. Como consumidor de la API, quiero validación estricta de cuerpo, tipo de contenido y campos, para recibir errores previsibles sin escrituras parciales.
17. Como consumidor de la API, quiero límites de tamaño incluso sin Content-Length fiable, para que un cuerpo excesivo no agote recursos.
18. Como consumidor de la API, quiero códigos HTTP y errores estables sin detalles internos, para manejar errores sin exponer infraestructura.
19. Como visitante, quiero que las respuestas privadas no se compartan mediante caché, para mantener la confidencialidad de mi sesión.
20. Como responsable, quiero controles de abuso en entradas anónimas y consultas costosas, para limitar consumo no deseado de recursos gratuitos.
21. Como participante, quiero que repetir una misma intención produzca un solo efecto, para reintentar después de perder una respuesta.
22. Como participante, quiero que reutilizar una intención con contenido diferente produzca un conflicto, para evitar resultados ambiguos.
23. Como coordinador, quiero que comandos simultáneos sobre una versión no sobrescriban decisiones, para conservar la secuencia de la operación.
24. Como visitante, quiero que solicitudes concurrentes respeten el límite de tres recorridos, para que el cupo sea consistente.
25. Como responsable, quiero que estado, versión, recibo, evento y pendiente se confirmen juntos, para no dejar la operación incompleta.
26. Como participante, quiero que un fallo SQL revierta todos los cambios relacionados, para poder reintentar sin duplicación.
27. Como visitante, quiero recibir confirmación solo después del commit local, para no interpretar como guardado algo que se perdió.
28. Como participante, quiero que una caída de Hedera conserve lo guardado localmente, para recuperar la publicación después.
29. Como responsable, quiero que las llamadas externas se ejecuten fuera de las transacciones SQL, para evitar bloqueos prolongados.
30. Como responsable, quiero concurrencia acotada y orden por recorrido, para mejorar capacidad sin duplicar ni adelantar hitos.
31. Como responsable, quiero que trabajadores solapados respeten leases vigentes, para que uno solo coordine cada publicación.
32. Como responsable, quiero recuperar leases abandonados sin reenviar a ciegas, para manejar caídas y resultados inciertos.
33. Como responsable, quiero que el cron exija una credencial independiente, para impedir mantenimiento público no autorizado.
34. Como responsable, quiero que ejecuciones repetidas y simultáneas del cron sean seguras, para tolerar reintentos del programador.
35. Como responsable, quiero que el mantenimiento tenga límites de tiempo y lotes, para respetar el entorno gratuito.
36. Como responsable, quiero observar trabajo pendiente y ejecuciones incompletas, para distinguir progreso de mantenimiento terminado.
37. Como visitante, quiero que el vencimiento impida acceso aunque la limpieza todavía no corra, para no depender del horario del cron.
38. Como responsable, quiero que la limpieza respete retenciones y trabajo en curso, para no perder evidencia vigente.
39. Como interesado que solicita una demo, quiero que mis datos reales permanezcan separados de la trazabilidad pública, para proteger mi contacto.
40. Como responsable, quiero exportar contactos vigentes de forma privada y paginada, para no exponerlos ni agotar memoria.
41. Como responsable, quiero claves foráneas y restricciones comprobadas, para impedir referencias huérfanas y valores inválidos.
42. Como responsable, quiero políticas explícitas de borrado y actualización, para evitar cascadas inesperadas.
43. Como responsable, quiero preservar snapshots y eventos históricos, para interpretar cada operación con los datos que tenía al producirse.
44. Como responsable, quiero una fuente de verdad para cada dato mutable, para evitar divergencias entre copias.
45. Como responsable, quiero criterios explícitos para enums, catálogos y snapshots, para normalizar donde aporte integridad sin perder historia.
46. Como responsable, quiero distinguir eventos de dominio, intentos de publicación y logs operativos, para investigar fallos sin mezclar significados.
47. Como responsable, quiero revisar las funciones y triggers existentes, para conservar sus invariantes sin elevar privilegios innecesariamente.
48. Como responsable, quiero índices respaldados por consultas y mediciones, para mejorar lecturas sin encarecer escrituras sin beneficio.
49. Como responsable, quiero medir latencia, contención, conexiones y consultas, para evaluar eficiencia con evidencia reproducible.
50. Como responsable, quiero límites de conexiones y tiempos de espera coherentes, para que la aplicación falle de forma controlada ante saturación.
51. Como responsable, quiero conexiones remotas cifradas y credenciales con privilegios mínimos, para limitar exposición y daño potencial.
52. Como responsable, quiero verificar la separación efectiva entre ejecución y migraciones, para que una URL distinta no se confunda con permisos distintos.
53. Como responsable, quiero migraciones verificables y recuperación documentada, para aplicar cambios sin asumir que un rollback SQL revierte servicios externos.
54. Como responsable, quiero comprobar restauración y persistencia tras reinicio en un entorno aislado, para fundamentar recuperación y durabilidad.
55. Como mantenedor, quiero ampliar las pruebas existentes en sus fronteras actuales, para detectar regresiones sin acoplarlas a funciones privadas.
56. Como responsable, quiero separar evidencia local de evidencia del proveedor, para no presentar configuración declarada como aceptación remota.

## Implementation Decisions

### Alcance y diagnóstico inicial

- Esta etapa produce una spec; la auditoría ejecutable y las correcciones son trabajo posterior. Conservar los ADR de demo separada del piloto y presupuesto cero, y la gestión de PostgreSQL mediante integración nativa de Vercel acordada en S19.
- Revisar sesiones, frontera HTTP, comandos y consultas privadas, proyección pública, contactos y exportación, coordinación de publicaciones, mantenimiento, acceso a PostgreSQL, migraciones y preparación de entrega. No crear otra capa de autorización ni otro coordinador mientras las fronteras actuales permitan resolver el problema.
- El inventario estático inicial es el siguiente. «Observado» significa encontrado en código o migraciones, no ejecutado durante S21:

| Área | Observado | Verificación o decisión pendiente |
| --- | --- | --- |
| Credencial de sesión | Token aleatorio de 32 bytes; HMAC SHA-256 persistido; sesión de 24 horas | Rechazo de credenciales alteradas, exposición, expiración exacta y rotación de secretos |
| Cookie | HttpOnly, SameSite=Lax, Secure en producción, Path y vencimiento explícitos | Comportamiento real con HTTPS, alcance y ausencia de almacenamiento alternativo |
| AuthN y AuthZ | Identificación de sesión anónima y consultas filtradas por propietario/vigencia; roles simulados | Matriz de endpoints y permisos; no equivale a identidad empresarial |
| Access/refresh tokens | No se encontró emisión, renovación ni familia de refresh tokens | No aplicable al diseño actual; no calificarlos como implementados |
| API | Esquemas estrictos, cuerpo acotado, origen configurado, cabecera propia, errores compartidos y no-store privado | Cobertura completa de rutas, métodos, caché y abuso |
| Atomicidad | Transacciones serializables de hasta 5 segundos, compare-and-set de versión, unicidad e idempotencia | Ejecutar casos de rollback, contención, fallos y recuperación existentes y faltantes |
| Publicación | Pendiente durable junto al evento; activación con after; llamadas externas fuera de SQL | Recuperación tras interrupción, orden y ausencia de efectos externos antes del commit |
| Cron | Barrido diario a las 03:00 UTC, Bearer independiente, comparación timing-safe, lease y trabajo acotado | Repetición, solapamiento, backlog, autenticación efectiva y evidencia desplegada |
| Integridad SQL | PK, FK, UNIQUE, CHECK, índices y triggers que protegen eventos, snapshots y datos de envío | Presencia y comportamiento en la BD realmente migrada |
| Modelo de datos | Contactos separados; snapshots JSONB, recibos y eventos históricos; intentos relacionales e historial JSON | Fuente de verdad y justificación de cada copia o proyección |
| Rendimiento | Pool de dos conexiones por cliente, timeouts, lotes de limpieza y exportación paginada | Planes, latencias, consultas, contención y conexiones agregadas entre instancias |
| Seguridad de BD | Configuración privada y validación TLS de URLs del candidato en preflight | TLS efectivo, permisos, propietarios, grants y acceso por red; no demostrados con URLs |
| Abuso y revocación | No se encontraron controles generales de frecuencia ni una operación dedicada de logout/revocación | Evaluar brecha y política proporcional a la demo; documentar expiración y rotación actuales |

### API, autenticación, autorización y sesiones

- Mantener token opaco de sesión en cookie y secreto exclusivamente del servidor. HttpOnly restringe lectura de la cookie por JavaScript; se complementa con controles de XSS, CSRF, origen y autorización. No presentar HttpOnly como garantía suficiente por sí solo.
- Conservar la duración fija de 24 horas, tres recorridos por sesión y roles simulados. No añadir renovación silenciosa, cuentas, contraseñas, OAuth ni RBAC empresarial como consecuencia automática de esta revisión.
- Para cada endpoint registrar público/privado/administrativo, método, entrada, estado HTTP, efectos, límite de trabajo, caché y autorización. La pertenencia de eventos e intenciones al recorrido debe verificarse, además de la pertenencia del recorrido a la sesión. Una lectura pública jamás autoriza mutaciones.
- Validar sesión, propietario y vigencia dentro de la unidad SQL que protege la operación. Mantener deny-by-default, rechazo de campos extra y errores sin detalles SQL, secretos ni datos de contacto. No confiar en el rol enviado por el cliente como identidad real.
- Documentar invalidación por expiración y efecto de rotar el secreto. Evaluar si una revocación individual es necesaria para este prototipo y registrar decisión y consecuencias; no afirmar que existe. Un eventual cambio del modelo de identidad requerirá una spec propia que trate renovación, revocación, rotación y detección de reutilización de refresh tokens.
- Revisar origen exacto, cabecera requerida, Content-Type, CORS y peticiones sin origen o cabecera. No confiar en Host ni X-Forwarded-Host enviados por el visitante. Conservar caché privada con no-store y separación de respuestas administrativas.
- Evaluar protección de creación de sesiones, contacto y verificación remota frente a ráfagas e identidades renovadas. El cupo de recorridos y el límite HCS no sustituyen el control de frecuencia. La corrección debe fijar umbrales, ventana, alcance entre instancias, recuperación, respuesta de rechazo y coste antes de implementarse; no basta un contador en memoria de una instancia. Mantener disponibles pruebas y navegación legítimas y no contratar servicios pagos.

### Sincronía, asincronía, paralelismo y concurrencia

- Confirmar SQL antes de responder que la operación quedó guardada. Responder sin esperar la publicación externa, manteniendo estado pendiente durable. after activa trabajo después de la respuesta y está sujeto al tiempo de ejecución de la plataforma; no sustituye la persistencia ni el mecanismo de recuperación.
- Distinguir asincronía de E/S, concurrencia entre solicitudes y paralelismo de cómputo. No introducir worker threads ni Promise.all como requisito general. Paralelizar únicamente trabajo independiente cuando mediciones demuestren beneficio, con límites acordes al pool y a las cuotas.
- Mantener secuenciales las dependencias de autorización, transición de estado y orden de hitos. No asumir que consultas sobre una misma conexión transaccional se ejecutan en paralelo por agrupar promesas.
- Conservar recibo de intención, versión, estado, evento y pendiente en una transacción. Repetir la intención original debe recuperar el resultado; cambiar su contenido debe generar conflicto. Revisar que errores de serialización, deadlocks y unicidad tengan una respuesta estable y no reejecuten efectos externos automáticamente.
- Mantener llamadas de red fuera de transacciones y decisiones durables de cuota/lease antes del envío. El commit SQL y la confirmación HCS no forman una transacción ACID distribuida. La recuperación concilia resultados inciertos usando la identidad del envío, sin prometer exactamente una ejecución de red.
- Los leases deben impedir que trabajadores vencidos confirmen resultados ajenos. Conservar orden por recorrido y demostrar exclusión durante limpieza, recuperación, envío y reintentos manuales concurrentes.

### Cron, retención y observabilidad

- Conservar cron diario, Bearer con secreto independiente, ejecución manual administrativa y núcleo de mantenimiento compartido. Verificar rechazo antes de modificar datos y respuesta segura si falta configuración.
- Probar reentrada, ejecución simultánea, interrupción, vencimiento del lease y recuperación. Mantener presupuesto temporal, lotes y límite de publicaciones; no marcar el día completado mientras exista trabajo elegible pendiente. Un barrido acotado no implica haber eliminado todo el backlog.
- Mantener retención operativa de siete días y contactos de 90 días. El acceso vence por condición de consulta; la eliminación física depende del siguiente mantenimiento exitoso y de su capacidad de procesar pendientes. No eliminar trabajo con un lease válido.
- Registrar identificador de ejecución o correlación cuando corresponda, resultado, duración, cantidades, conflictos, publicaciones pendientes y categorías de fallo. Separar logs operativos de eventos de dominio e intentos de red. No registrar cookies, secretos, conexiones, contactos ni bytes firmados.
- Evaluar un registro durable de mantenimiento solo si la observabilidad actual no permite verificar los criterios. Su retención, fuente de verdad y coste deben estar definidos; no crear tablas de log genéricas por completar una lista.

### Modelo relacional, integridad, transacciones y recuperación

- Identificar para cada entidad claves, dependencias funcionales, datos mutables, históricos y derivados. Aplicar normalización a los datos operativos; conservar desnormalización histórica cuando garantice reproducibilidad y tenga justificación documentada.
- El snapshot del escenario, el payload del evento y el resultado original del comando cumplen funciones históricas distintas. No reemplazarlos por referencias a catálogos mutables. Auditar específicamente historial JSON de publicación, tabla de intentos y resumen actual: definir qué es fuente de verdad, qué se deriva y qué invariantes mantienen sus copias consistentes.
- Mantener enums para vocabularios cerrados de estado y acción. Evaluar catálogos relacionales cuando los valores deban administrarse o referenciarse independientemente; motivos y viajes del escenario siguen perteneciendo al snapshot versionado mientras no cambie ese requisito. No introducir tablas de empresas reales en una demo ficticia.
- Inventariar PK, FK incluidas las compuestas, UNIQUE, CHECK, nulabilidad y políticas ON DELETE/ON UPDATE. Verificar referencias cruzadas de sesión, recorrido, recibo, evento e intento; impedir huérfanos y cascadas fuera de la retención prevista. No asumir que toda FK tiene índice útil automáticamente.
- Preservar representación exacta de cantidades y humedad y sus rangos; rechazar estados parciales de asignación y datos históricos alterados. Comprobar restricciones que viven en las migraciones SQL además del esquema ORM.
- Las transacciones nuevas o modificadas deben usar el mismo cliente transaccional en todas las escrituras relacionadas, mantener duración acotada y demostrar rollback completo. Una escritura SQL única ya es atómica; no añadir transacciones de varias consultas sin necesidad.
- Revisar funciones y triggers existentes por invariantes, permisos, efectos y compatibilidad con migraciones y limpieza. No añadir procedimientos almacenados por su sola existencia como «buena práctica»; requerir una necesidad de integridad o rendimiento demostrada y pruebas del contrato observable.
- Distinguir rollback de una transacción fallida, recuperación de migración, restauración de backup y conciliación de HCS. No editar migraciones ya aplicadas ni ejecutar una reversión destructiva contra una base compartida. Si cambia el esquema, añadir migración compatible, actualizar verificadores que inventarían migraciones y ensayar recuperación con datos sintéticos.
- Comprobar reapertura de conexión y reinicio con datos confirmados en BD aislada. Para backup/restauración del proveedor registrar disponibilidad, procedimiento y evidencia real; la configuración de PostgreSQL y del plan es condición externa, no una garantía derivada del uso del ORM.

### Eficiencia, índices y seguridad de PostgreSQL

- Medir las lecturas de sesión/recorrido, historial público, exportación de contactos, selección de pendientes y limpieza con cardinalidades representativas de la retención. Registrar versión de BD, volumen, entorno, región, calentamiento, concurrencia, p50/p95, fallos, consultas por petición, esperas y conexiones. Separar arranque en frío y espera de red del coste SQL.
- Examinar planes con EXPLAIN y, únicamente en entorno aislado, EXPLAIN (ANALYZE, BUFFERS). Revisar filtros, joins, ordenamiento, estadísticas e índices compuestos; un escaneo secuencial sobre una tabla pequeña no prueba un defecto.
- Investigar como candidatos el orden compuesto de exportación por fecha e identificador, selección de pendientes y lecturas por sesión/ordinal. Añadir, cambiar o retirar índices solo si los planes y mediciones muestran beneficio, contabilizando coste de escritura y almacenamiento. No declarar hoy un índice faltante como causa de lentitud sin ese análisis.
- Conservar lecturas proyectadas, paginación por cursor y trabajo acotado. Buscar N+1, consultas repetidas y lecturas serializables innecesariamente amplias. Una reducción del aislamiento exige demostrar que mantiene visibilidad consistente y no altera autorización ni reglas concurrentes.
- El pool actual limita dos conexiones por cliente, no el total del despliegue. Verificar reutilización, instancias simultáneas, pooler del proveedor, backpressure, timeouts y cancelación. No aumentar paralelismo o conexiones sin medir saturación y límites gratuitos.
- Verificar SQL parametrizado y ausencia de interpolación insegura, credenciales fuera del cliente, TLS con validación apropiada del servidor y restricciones de acceso disponibles en el proveedor. Preflight comprueba formato de configuración; no demuestra cifrado ni permisos efectivos de una sesión abierta.
- Inventariar roles efectivos de ejecución, migraciones y exportación; privilegios heredados, propiedad de objetos, CREATE en esquemas y EXECUTE de funciones. La aplicación debe carecer de superusuario, creación de roles y DDL innecesario. Diferenciar permisos administrativos de los de ejecución según las capacidades del proveedor y verificarlo con pruebas positivas y negativas.
- Evaluar RLS solo si aporta una barrera adicional viable para el modelo de conexión; no declararla existente ni sustituir autorización de aplicación por una política no verificada. Revisar exposición de funciones, privilegios PUBLIC y search_path cuando corresponda, especialmente si se usan funciones con privilegios elevados.

### Entregables y criterios de cierre

- Entregar matriz completa de los ámbitos solicitados con referencia de evidencia, clasificación, prioridad y resultado de corrección. Las brechas requeridas que permanezcan abiertas impiden declarar cumplimiento integral; las no aplicables necesitan una razón ligada al alcance.
- Conservar los contratos HTTP existentes salvo corrección documentada de una brecha. Cualquier nuevo comportamiento de rechazo debe indicar estado, código estable y estrategia de reintento cuando corresponda.
- Cero accesos cruzados o filtraciones en los casos definidos; cero efectos parciales tras rollback; cero cupos excedidos; ningún hito adelantado o envío ciego por recuperación. Los casos de conflicto son resultados esperados y deben distinguirse de errores de infraestructura.
- Para cada optimización publicar medición antes/después con el mismo escenario, entorno y carga, repetida al menos tres veces. Definir el presupuesto de rendimiento y tolerancia de regresión antes de modificar el código, a partir de la línea base; no fijar cifras de latencia universal sin mediciones ni considerar aprobado un benchmark solo por terminar.
- Las pruebas locales no cierran TLS, grants, cron desplegado, backup ni rendimiento remoto sin evidencia del entorno objetivo. No afirmar que un proveedor simulado acredita disponibilidad de testnet o del hosting.

## Testing Decisions

- Frontera principal: servidor Next.js real por HTTP, PostgreSQL aislado y proveedor HCS/mirror controlado en su frontera externa. Reutilizar reloj controlado, visitantes independientes y escenarios de fallo ya existentes. No simular Prisma ni probar funciones privadas para demostrar autorización o atomicidad.
- Frontera complementaria: navegador real para atributos y envío de cookie, imposibilidad de leerla mediante document.cookie, recarga, vencimiento y ausencia de credenciales en almacenamiento accesible al frontend. Comprobar Secure mediante HTTPS o una observación real del candidato; HTTP local por sí solo no lo acredita.
- Conservar antecedentes API-01–API-04 para sesión y aislamiento, API-02/API-12 para concurrencia e idempotencia, API-13 para fallo de commit y caída de PostgreSQL, API-17/API-19/API-20 para cuota/trabajadores/cron, API-21–API-23 para retención, exportación y datos privados y API-26 para lecturas sin efectos. Su existencia no equivale a una ejecución nueva aprobada.
- Ampliar con casos de credencial ausente/alterada/vencida, recurso ajeno, evento ajeno, origen/cabecera ausentes, cuerpos excesivos y tipos incorrectos, métodos no permitidos, respuesta privada no cacheable y comportamiento de límites de abuso acordados. Observar estado posterior y ausencia de efectos, además del código HTTP.
- Ejecutar conflictos con visitantes y solicitudes realmente concurrentes, repeticiones con la misma y distinta intención, caída después de guardar y antes de publicar, trabajador vencido que retorna tarde y mantenimiento solapado. Usar barreras o las capacidades existentes del arnés, sin sleeps arbitrarios como prueba de exclusión.
- Para invariantes SQL y privilegios usar un cliente aislado con el rol evaluado y datos sintéticos: intentar referencias inválidas, alteración histórica y operaciones administrativas prohibidas. Observar rechazo y estado conservado. Estas comprobaciones complementan HTTP donde el catálogo o los grants no son visibles.
- Medir eficiencia en una ejecución separada de la suite funcional, para que variabilidad de máquina o red no vuelva inestables las pruebas de contrato. Conservar planes y resultados saneados, sin credenciales ni datos reales.
- En cambios de esquema verificar migración desde el estado anterior y creación desde cero, restricciones/triggers efectivos y recuperación ensayada en BD descartable. Para durabilidad y restauración comprobar datos antes/después; no inferir ACID completo de un único test de rollback.
- En una implementación posterior ejecutar comprobaciones de tipos, esquema, suite API y pruebas de navegador afectadas. Esta spec documental solo requiere validar estructura, enlaces, cobertura del pedido y diff; no crea pruebas redundantes ni ejecuta cargas o migraciones reales.

## Out of Scope

- Implementar código, migraciones, pruebas o infraestructura durante esta conversión a spec.
- Convertir la demo en un producto con cuentas, identidad empresarial, roles reales o multiempresa; introducir JWT, OAuth o refresh tokens sin un nuevo requisito de identidad.
- Añadir catálogos, tablas de log, índices, RLS, procedimientos almacenados, colas externas o threads por completar un checklist sin necesidad demostrada.
- Cambiar el dominio, reglas del lote, compatibilidad, estados de operación, política de retención, cuotas acordadas o contratos públicos sin justificación y especificación del cambio.
- Contratar planes, alterar recursos o permisos de producción, exportar contactos reales, enviar mensajes HCS, ejecutar pruebas de carga contra servicios compartidos o publicar un despliegue como parte de la auditoría local.
- Certificar seguridad absoluta, cumplimiento normativo, disponibilidad comercial, una latencia universal o atomicidad distribuida entre PostgreSQL y Hedera.

## Further Notes

Las fronteras API y navegador ya están confirmadas en la documentación del proyecto y se conservan. Las comprobaciones SQL son evidencia puntual de controles no observables por HTTP, no una nueva interfaz del producto.

La revisión encontró un remote GitHub, pero la documentación vigente declara pendiente la configuración del tracker y no aporta una configuración nueva de destino/triage. No se interpreta la mera existencia del remote como configuración del flujo de publicación. Para publicar esta spec y aplicar realmente ready-for-agent, ejecutar `/setup-matt-pocock-skills`. No se creó una issue ni se aplicó una etiqueta.

Se respetaron el glosario, los ADR y las decisiones vigentes de S03, S04, S07–S11, S17–S19. La guía de after incluida en el Next.js instalado se consultó para distinguir ejecución posterior a la respuesta de durabilidad. Las referencias externas sustentan los criterios generales y deben contrastarse con las versiones instaladas y el proveedor al implementar:

- [OWASP: gestión de sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): transporte, cookies, ciclo de vida y límites de protección de la sesión.
- [PostgreSQL: privilegios](https://www.postgresql.org/docs/current/ddl-priv.html): propiedad y permisos efectivos de los objetos.
- [PostgreSQL: EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html): evidencia de planes de ejecución y evaluación de consultas.

El diagnóstico inicial se limita a lo observado. No se leyeron valores de credenciales ni se evaluaron datos reales; no se ejecutaron suites ni benchmarks y no se acreditó configuración externa.
