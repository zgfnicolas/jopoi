# S15 · Trazabilidad pública y QR

Implementada en `feature/s15-trazabilidad-publica-y-qr`, creada desde `main` actualizado en `232ca6c`, con S14 integrado mediante PR #13. Completa la consulta pública y añade QR compartido al panel. No agrega endpoints, dependencias, variables, migraciones ni servicios. La API de S11 conserva sus contratos y su comportamiento de solo lectura.

## Consulta e información verificable

`/trazabilidad/{traceId}` valida y normaliza el UUID en servidor. Conserva metadatos noindex y solo entrega al cliente el identificador y el origen público permitido; no recupera una sesión ni incluye credenciales. La lectura del historial y el contraste usan GET del mismo origen con `credentials: "omit"`, `no-store`, rechazo de redirects, timeout y validación runtime. Las lecturas privadas mantienen su valor predeterminado `same-origin`.

La vista muestra contexto ficticio, material, empresas, ruta, viaje asignado cuando existe, resultado operativo y vencimiento. Declaración y recepción proceden de los hitos públicos íntegros de S11. El borrador no revela cantidad/humedad; rechazo e incidencia se distinguen de conformidad y no aparecen como pasos futuros pendientes. El peso recibido no reemplaza el declarado.

El historial ordenado mantiene visibles rol simulado, fecha SQL, publicación, integridad local y contraste histórico. El detalle desplegable incluye versión, identificador, payload, hashes, evidencia y referencias. Abrir el detalle no consulta testnet.

El JSON se muestra indentado para lectura; **Copiar payload canónico JCS** usa `canonicalJson` del dominio para copiar la representación que corresponde a SHA-256. El hash guardado tiene copia separada. Se diferencia hash guardado en SQL, recalculado por la aplicación y observado en testnet; el navegador no afirma haber recalculado SHA-256 ni sustituye el veredicto de S11.

Si un hito tiene `event: null`, se conservan sus metadatos y digests disponibles con el aviso de inconsistencia. No se reconstruye el payload, declaración, motivo o recepción desde otra fuente. Los schemas permiten metadatos de versiones no soportadas con detalle ausente y verifican identidad, orden, hashes y coherencia de los eventos que sí están disponibles. Se sustituyó la proyección mínima pública de S12, retirando sus exports sin consumidores.

Los enlaces proporcionados por S11 se filtran para permitir únicamente HTTPS bajo `testnet.mirrornode.hedera.com`, con rutas previstas de transacción, topic o mensaje y sus parámetros conocidos. Los enlaces ajenos o de mainnet se descartan. Los destinos externos se identifican y abren otra pestaña con `noopener noreferrer`; no se incorpora otro explorador ni se aceptan destinos del visitante.

## Contraste explícito y caducidad

**Contrastar con testnet** llama solamente a `GET /api/traces/{traceId}/events/{eventId}/verification`. Se permite una consulta en curso por página, con guarda síncrona contra doble clic. No hay polling, contraste masivo ni reintentos automáticos. La API conserva sus límites de lectura remota y no firma, publica, consume reintentos de envío ni modifica SQL.

El resultado de cada clic sustituye la observación transitoria anterior de ese hito. La evidencia histórica del historial permanece separada; una coincidencia histórica no se presenta como resultado actual cuando la consulta falla. El estado SQL mostrado en el resumen no se transforma en confirmado porque una observación remota coincida. La respuesta actual identifica además el estado de publicación que el servidor leyó al responder.

| Resultado | Presentación |
| --- | --- |
| NOT_CHECKED | No había intento verificable; no se afirma lectura remota. |
| PENDING | Evidencia todavía pendiente, sin afirmar coincidencia. |
| MATCHED | Coincidencia de mensaje e identificadores en esa observación; no reconcilia SQL ni certifica entrega física. |
| MISMATCH | Discrepancia local o remota, sin corregir el detalle original. |
| UNAVAILABLE | Evidencia no comprobable ahora, conservando separado el historial. |
| Error de red, timeout o respuesta inválida | Error de la consulta actual; puede volver a solicitarse manualmente. No se reutiliza un MATCHED anterior como vigente. |

La observación muestra `observedAt`, referencias, secuencia/timestamp y hashes cuando están disponibles. Los booleanos falsos se presentan como coincidencia no acreditada; no se inventan fechas ni valores faltantes. Las respuestas se ligan al recorrido, evento, versión, topic, transacción y digests de la preparación visible.

Un 409 o cambio de preparación descarta la observación y refresca el historial; el usuario debe solicitar otro contraste. Un 404/410 invalida la vista y retira datos y controles. Otros errores transitorios de contraste conservan el historial todavía vigente. La invalidación del recurso elimina su DTO, además de desmontar el detalle.

Actualizar el historial desmonta las observaciones, aborta sus esperas y recupera SQL; no contacta automáticamente el mirror. Las respuestas tardías se ignoran al cambiar de identificador, actualizar, desmontar o vencer. Al finalizar una actualización manual se devuelve el foco al resumen o al aviso; las respuestas de contraste se anuncian y reciben foco.

La retención sigue siendo siete días. Temporizador, `pageshow` y cambios de visibilidad comprueban el vencimiento y retiran información, detalles, resultados y QR. Cada consulta también comprueba fechas antes de mostrar la respuesta. No hay almacenamiento persistente en el navegador ni reconstrucción desde HCS para prolongar disponibilidad.

## Enlace y QR compartidos

El componente `TraceShare` se usa en el panel S14 y en la consulta pública. El servidor lee la capacidad `origin` de S01 y entrega únicamente `string | null`; jamás serializa el objeto privado de configuración. La URL absoluta contiene el origen validado de `APP_URL` y `/trazabilidad/{UUID}`, sin cookies, claves, query ni fragmentos.

En desarrollo se conserva el origen local predeterminado de S01; para compartir entre dispositivos se necesita un origen accesible. En producción `APP_URL` debe estar configurado al preparar el despliegue. La estructura estática de `/demo` incorpora ese valor al build; cambiarlo requiere reconstruirla. La página pública dinámica lo lee al renderizar. La API S11 sigue sin necesitar `APP_URL`.

Si falta o es inválida la configuración pública, el historial sigue funcionando: se ofrece el enlace interno y una explicación, sin QR ni copia absoluta y sin reemplazar silenciosamente el origen por `window.location.origin`.

`qrcode` 1.5.4, ya instalado, se carga de forma diferida en el navegador. Genera un PNG de 256 px en memoria, corrección M, margen de cuatro módulos, tinta oscura sobre blanco y sin logo o recortes. El QR y el enlace copiado reciben la misma URL. No hay generador remoto, endpoint de imágenes, guardado SQL, archivo de imagen generado ni almacenamiento persistente.

Se reserva el espacio de la imagen, conserva proporción y texto alternativo y siempre aparece un enlace textual accesible. Si falla la generación se indica usar el enlace; si falla el portapapeles se conserva la alternativa manual. El vencimiento retira enlace, imagen y mensajes del componente. Consultar el QR no confirma retiro, entrega ni una firma empresarial.

## Direction contract

Modo **Read**, extensión del sistema S13/S14. Se preservan `DESIGN.md`, `.impeccable/design.json`, tokens globales y primitivos. El sidecar sigue siendo la extracción S13, no un catálogo exhaustivo de los componentes S15.

THESIS: comprender qué ocurrió y qué evidencia existe antes de inspeccionar los detalles técnicos; mantener operación, publicación e integridad como conceptos distintos.

OWN-WORLD: superficie clara, petróleo/teal, títulos locales condensados, cuerpo del sistema y estados textuales con iconos. El JSON usa tipografía de código dentro de su área; hashes y referencias ajustan líneas sin convertir la página en una consola.

STORY: leer el contexto ficticio y resultado, seguir los hitos, desplegar una evidencia, solicitar un contraste explícito y compartir una consulta que no concede propiedad.

FIRST VIEWPORT: resumen operativo y declaración/recepción visibles; historia y límites próximos. En móvil se apilan los datos; cada hito conserva resumen y estados antes del detalle desplegable. El QR acompaña a un enlace textual y no encabeza la operación.

FORM: resumen por hito con detalle desplegable y QR en panel y página pública, opciones confirmadas al planificar. Construcción directa en código, dentro del sistema existente, sin nuevo seed visual.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verificación y límites de entrega

Pasaron TypeScript, validación Prisma y build de producción. La revisión estática comprobó separación pública/privada, GET sin cookies, cancelación, caducidad, origen del QR, copia canónica, allowlist de enlaces y ausencia de escrituras. La revisión documental confirmó que puede preservarse el sistema visual existente. No se modificaron las rutas ni los DTO de S11.

**Veredicto visual: `recapture`.** CUA devuelve `apps: []`, `browsers: []`. No hay capturas ni aprobación de render, teclado, foco observado, lectura del QR en dispositivo o contraste remoto real. Hace falta una nueva revisión completa a 1440/390 px, incluyendo detalles, carga, error, discrepancia, borrador, vencimiento y QR del panel.

No se crearon ni ejecutaron suites, fixtures, sesiones, contactos, comandos de negocio, mantenimiento o llamadas testnet para verificar esta entrega. S17/S18 conservan los casos de aislamiento, QR/enlace/origen, copia fallida, ramas y payload inconsistente, estados de contraste, doble clic, respuestas tardías, conflictos, limpieza/caducidad y aceptación móvil/teclado. La comprobación real de red y escaneo se realiza separadamente en S18. No hubo commit, push ni despliegue.
