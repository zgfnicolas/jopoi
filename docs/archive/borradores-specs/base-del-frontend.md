# S12 · Base del frontend, navegación y estados compartidos

Implementada en `feature/s12-base-del-frontend`, desde `main` con S11 integrado mediante PR #10. La entrega incorpora estructuras mínimas navegables y lecturas reales. No completa la landing, el panel operativo ni la página de trazabilidad de S13–S15.

## Presentación provisional y navegación

**Actualización S13:** la descripción provisional de esta sección conserva el cierre histórico de S12. El estado vigente usa el sistema compartido de [DESIGN.md](../DESIGN.md), y `/` tiene la [landing y formulario real](landing-y-solicitud-de-demo.md). `/demo` y `/trazabilidad` mantienen la estructura y alcance de lectura aquí descritos. S13 agrega un transporte POST separado para contactos; el lector GET sigue intacto.

**Actualización S14:** `/demo` incorpora ahora el [panel operativo guiado](panel-operativo-guiado.md), con inicio y escrituras privadas explícitas sobre S04/S08/S10. La descripción de consulta provisional de este documento es histórica. `/trazabilidad` conserva la base de lectura S12 hasta S15; las API públicas no ganan permisos operativos.

**Actualización S15:** la [consulta pública completa y QR](trazabilidad-publica-y-qr.md) sustituyen la proyección mínima de trazabilidad. Sus GET omiten cookies; el transporte privado conserva el valor anterior. El recurso compartido permite invalidar y retirar el DTO al vencer o desaparecer el recorrido. El QR del panel y la consulta usan un único componente con origen público configurado, sin cambiar tokens globales ni contratos API.

El usuario confirmó una base provisional accesible: tema claro, superficies neutras, énfasis azul de interacción y tipografía del sistema. Los tokens CSS se concentran en `globals.css` y los componentes usan CSS Modules. No se adoptan los bocetos anteriores ni las fuentes instaladas como identidad aprobada. No hay logo, imágenes nuevas ni dependencia de un CDN de fuentes. La identidad definitiva se resolverá en S13; `.impeccable/config.json` registra la preferencia confirmada `buildPath: code` para esa futura landing.

El layout raíz declara `es-AR`, título/description, navegación, enlace para saltar al contenido, main y pie. Jopói conserva su nombre y lenguaje del glosario. La leyenda de prototipo personal, datos ficticios y testnet es visible en las tres superficies. Los metadatos de demo/trazabilidad indican no indexar esos datos.

| Superficie | Comportamiento implementado |
| --- | --- |
| `/` | Explicación breve del concepto, acceso a demo y localizador por UUID. Book a demo enlaza a una sección informativa que aclara que el formulario aún no está habilitado. No solicita ni envía contactos. |
| `/demo` | GET `/api/demo/runs/current`. Recupera una sesión/recorrido existentes y muestra material, cantidad, humedad, estado, vencimientos, cupo y enlace público. No inicia sesión o recorrido. |
| `/trazabilidad/{traceId}` | Valida y normaliza UUID y lee GET `/api/traces/{traceId}`. Muestra contexto ficticio, declaración/recepción disponibles y resumen por hito de publicación, integridad local y contraste histórico. No consulta mirror. |

La navegación lleva a inicio, demo, localizador y Book a demo. El localizador conserva el texto ingresado ante error, asocia el mensaje al campo y devuelve el foco al input. Solo construye rutas internas con UUID validado; no acepta destinos externos ni enumera operaciones.

Las estructuras mínimas explican su disponibilidad actual sin controles operativos simulados. El formulario real y narrativa económica quedan en S13; inicio, mutaciones, roles y recorrido completo en S14; línea de tiempo detallada, hashes, contraste remoto y QR en S15.

## Lecturas y caducidad

La estructura y el contenido estático usan Server Components; navegación activa, localizador y lectores son Client Components pequeños. El layout no recupera sesiones ni accede a SQL. Las páginas se construyen sin conectar la base. Los lectores no importan Prisma, secretos, configuración ni SDK Hedera.

El transporte compartido solo permite GET a `/api/`, usa credenciales del mismo origen, `no-store`, rechazo de redirects y timeout de 15 segundos. Valida JSON y los campos de DTO que la vista consume mediante schemas de proyección: descarta atributos no usados y no replica reglas de operación. En errores solo usa códigos del catálogo y su mensaje redactado por la aplicación; no muestra mensajes crudos, stacks o respuesta HTML. Puede mostrar el UUID diagnóstico seguro de la API.

El hook compartido cancela solicitudes al desmontar o cambiar de identificador, ignora respuestas anteriores y bloquea actualización duplicada desde el mismo control. Se actualiza al abrir la superficie o por acción explícita. No hay polling ni reintento automático.

Los datos viven en memoria del componente; no se guardan en localStorage, sessionStorage ni una caché persistente. Al vencer, la vista reemplaza el DTO por una explicación y retira los datos operativos. Usa el menor vencimiento de sesión/recorrido para la vista privada y `expiresAt` de la consulta pública. Comprueba también al recuperar visibilidad o mediante `pageshow`; un temporizador de vencimiento no consulta la API. El backend conserva la autoridad sobre permisos y fechas.

Se distinguen sesión requerida, sesión vencida, recorrido ausente, consulta vencida, conflicto, cupo e indisponibilidad. Una nueva visita no crea identidad automáticamente y un enlace público no concede propiedad. El frontend no inventa datos para sustituir una dependencia caída.

## Componentes, estados y formato

La base incluye acciones/enlaces, campos con etiquetas/ayuda/error, avisos anunciables, estados vacíos, carga, error de página y error global. `Field` conserva valores controlados por su superficie; ni los avisos ni el transporte limpian formularios. `FormFeedback` prepara reposo/edición, guardando, guardado, error de campo, conflicto, sesión vencida, cupo e indisponibilidad para los formularios futuros; estos estados de guardado todavía no se activan con mutaciones en S12.

Los estados se muestran mediante texto e icono de Lucide, sin depender únicamente del color:

- **Operación:** borrador, publicado, aprobado, transporte asignado, retiro confirmado, recepción conforme, rechazo o incidencia.
- **Publicación:** pendiente, en curso, incierto, confirmado en testnet, error o pausa por cupo/configuración.
- **Integridad local:** detalle íntegro o discrepancia local; no equivale a contraste de Hedera.
- **Contraste histórico:** sin comprobar, pendiente, coincidente, discrepante o no disponible. Se informa la fecha guardada cuando existe y se aclara que no se hizo una consulta remota nueva.

Cantidades, humedad y ARS se formatean desde cadenas canónicas, agrupando la parte entera con BigInt y preservando los decimales, incluido un signo negativo de importes cuando corresponde. No se convierten pesos/importes grandes a Number ni se cambian valores para enviar a la API. Las fechas usan `es-AR`, zona `America/Argentina/Buenos_Aires` y etiqueta UTC−03:00.

Los estilos contemplan distribución fluida móvil/escritorio, reflujo de navegación y resúmenes, identificadores largos, foco visible, etiquetas persistentes, orden semántico, mensajes mediante status/alert, selección de texto, reduced-motion y colores forzados. No hay animación necesaria para entender la tarea. Se evita el uso de tablas que oculten datos esenciales en móvil.

## Verificación y limitaciones

Pasaron TypeScript, validación Prisma, build de producción y revisión estática del diff, rutas, imports cliente y transporte exclusivamente GET. El build reconoce las tres superficies junto con las once rutas de API existentes. No se agregaron dependencias, variables, migraciones ni cambios en el backend.

**La revisión visual manual a 390/1440 px y teclado quedó pendiente:** la herramienta de control UI devolvió inventario vacío de navegadores y aplicaciones, y el navegador integrado no está disponible. No se declara comprobado el render responsive, los anuncios de lector de pantalla o la interacción real por navegador a partir del build. Esa limitación requiere retomar la revisión cuando haya un navegador conectado.

No se crearon ni ejecutaron suites, datos de negocio, sesiones, contactos, mantenimiento o mensajes HCS. S17/S18 conservan las pruebas por API/navegador. Escenarios documentados: errores que conservan campos, sesión/cupo, expiración con pestaña abierta, regreso desde historial, solicitudes tardías, cancelación, precisión decimal, separación de estados, ausencia de secretos, navegación por teclado y equivalencia móvil/escritorio. No hay commit ni despliegue creado en esta entrega.
