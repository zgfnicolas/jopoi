# S14 · Panel operativo guiado

Implementado en `feature/s14-panel-operativo-guiado`, creada desde `main` actualizado en `a946898` con S13 integrado mediante PR #12. `/demo` sustituye la consulta provisional por acciones conectadas a S04/S08/S10. No agrega endpoints, migraciones, variables, dependencias ni infraestructura.

## Inicio, roles y recorrido

Al montar solo se lee `GET /api/demo/runs/current`; recargar no inicia sesión ni consume una exploración. Sin sesión aparece **Comenzar**. El clic recupera primero una posible cookie existente, crea sesión si falta mediante POST explícito y después inicia/retoma el recorrido con una intención estable. Con sesión y `run: null`, se inicia solamente el recorrido. Las respuestas de creación/repetición se validan y se recupera por su `traceId`, sin asumir que una repetición corresponde al activo más reciente de otra pestaña.

Se representa inicialmente al generador. El selector permite cambiar entre cuatro roles simulados y el botón **Representar a…** propone el necesario para el siguiente paso; cambiar no envía comandos ni firma por otra empresa. La selección se conserva en memoria durante esta visita y no cambia automáticamente al avanzar.

| Estado | Acción guiada |
| --- | --- |
| DRAFT | Kg y humedad editables. Publicar guarda los valores visibles y publica en una acción; guardar borrador es secundario y no crea hito. |
| PUBLISHED | Requisitos del comprador, aprobación o rechazo con motivo precargado. No se aprueba humedad superior al límite. |
| APPROVED | Comparación de viajes con material, capacidad, carrocería, ruta y ventana. Selección incompatible deshabilitada con explicación visible; si ninguno sirve, se explica la cantidad y la posibilidad de explorar otro recorrido. |
| ASSIGNED | Confirmación explícita de retiro por transportista, separada de consultar el enlace o un QR. |
| PICKED_UP | Peso recibido y elección de conformidad o incidencia. Una diferencia impide conformidad y requiere un motivo coherente. |
| RECEIVED / REJECTED / INCIDENT | Cierre definitivo, motivo cuando corresponde, pesos separados y consulta. No hay reapertura ni edición. |

Las validaciones reutilizan `normalizeOperationCommand` y `decideOperation` del dominio S06; la API conserva autoridad. La UI admite un solo separador decimal, coma o punto, sin miles, signos, exponentes, espacios ni redondeo. Se envían strings normalizados con punto; kg admite tres decimales y humedad dos. Se conserva el rango de almacenamiento y la aritmética exacta de S06, sin convertir pesos a Number.

El resumen muestra los datos guardados; la edición local se identifica como sin guardar. Economía y compatibilidad proceden de SQL y su snapshot persistido. El recibido no sustituye la declaración para calcular. Fotos, atribuciones y comprobante son referencias locales; el comprobante sigue siendo un ejemplo estático de 12.000 kg aunque se edite otra cantidad. No se solicitan uploads.

**Nuevo recorrido** está disponible antes o después del cierre, con confirmación inline y cupo visible. Advierte que se perderá la edición local. La respuesta válida seguida de lectura cambia al nuevo recorrido; el anterior conserva su historial y un enlace público en memoria. El cuarto se bloquea por contador y por la API; un rechazo de cupo refresca el resumen. No se crea una nueva sesión como alternativa para evadir ese límite.

## Estado del cliente e intenciones

`useOperationPanel` coordina snapshot SQL, lecturas, guardas síncronas, intención pendiente, confirmación y caducidad. El formulario mantiene su edición local, separada del snapshot. Los modelos runtime validan sesión, recorrido, escenario completo, economía, compatibilidad, comandos y publicación. El schema del escenario se extrajo literalmente de `server/operations/storage.ts` a `domain/scenario-schema.ts`, reutilizado por ambos lados sin alterar la validación SQL; los módulos cliente no importan servidor, ORM, secretos ni SDK.

El transporte POST privado es separado de los lectores GET y del contacto S13. Solo acepta rutas operativas previstas, JSON de hasta 4096 bytes, cookies del mismo origen, cabecera `X-Jopoi-Request: demo`, `no-store`, rechazo de redirects y timeout de 15 segundos. Valida los estados HTTP esperados y mensajes del catálogo; no imprime cuerpos, credenciales o errores internos.

| Situación | Resolución |
| --- | --- |
| Doble clic / solicitud en curso | Una guarda síncrona impide otra escritura en ese panel; los controles quedan bloqueados. |
| Error de validación o regla | Conserva campos, informa y permite corregir. No cambia el estado como si hubiera persistido. |
| Timeout, error de red, respuesta inválida o 5xx | Conserva destino, UUID y cuerpo exactos. Bloquea edición y otras escrituras; reintento manual con la misma intención. No hay reenvío automático. |
| POST confirmado con GET posterior fallido | Mantiene el mensaje de guardado SQL; marca los datos como lectura anterior y bloquea nuevas acciones hasta actualizar. No repite el POST. |
| Conflicto de versión, estado o idempotencia | Recupera el detalle vigente, conserva edición separada y exige revisión explícita. En borrador se puede conservar la edición para volver a enviar o adoptar los datos guardados; nunca se cambia expectedVersion con la misma clave. |
| Versión cambiada en una lectura | La edición pendiente no se sobreescribe; exige revisar antes de enviarla con una nueva intención. |
| Sesión vencida / ausente | Retira datos privados, intención y formularios. Permite empezar explícitamente; no hereda propiedad del recorrido anterior. |
| Recorrido no disponible | No revela si era ajeno, vencido o eliminado. Permite consultar el actual mediante GET, sin crear otro. |

Cada comando captura rol, acción, `expectedVersion` y UUID. La confirmación comprueba `saved: true`, identificador del recorrido, versión aplicada y coherencia de evento/publicación; un replay puede tener un estado vigente posterior al aplicado. `save` no se interpreta como hito. El reintento HCS comprueba también el identificador del evento.

La intención inicial de sesión no tiene UUID en el contrato S04: ante incertidumbre se consulta la cookie antes de repetir el bootstrap. Si la cookie nunca llegó, no se promete recuperar esa identidad. La serialización del cliente corresponde al panel montado; no es un bloqueo distribuido entre pestañas. Las versiones y recibos del servidor resuelven las carreras operativas.

Datos locales, rol, edición y enlaces viven en memoria. No se usa localStorage/sessionStorage ni se reconstruye una escritura al recargar. El vencimiento se comprueba con temporizador, `pageshow`, cambio de visibilidad y antes de escribir. Se abortan esperas al desmontar y se ignoran respuestas tardías; abortar no garantiza cancelar SQL ya ejecutado. Un enlace público puede conservarse hasta el vencimiento del recorrido, sin conservar su contenido privado.

## Historial, red y consulta pública

El historial desplegable muestra hitos ordenados, responsable simulado, fecha SQL, publicación y contraste histórico. Confirmación y contraste son independientes; `verifiedAt` no se presenta como una consulta remota nueva. Se muestran intentos, cuota global, fecha de elegibilidad y espera por predecesor. Las fechas no prometen ejecución puntual y los pendientes no impiden avanzar la operación.

El propietario puede autorizar el adicional cuando `manualAvailable` lo permite. Un envío `UNCERTAIN` sin predecesor bloqueante permite solicitar reconciliación. El POST S10 conserva la intención y distingue `ALREADY_CONFIRMED`, `BLOCKED`, `RECONCILE_ONLY`, `MANUAL_AUTHORIZED`, `EXHAUSTED` y `AUTOMATIC_PENDING`. Ni autorización ni 202 se llaman confirmación testnet. No se conceden reintentos fuera de las guardas S10.

Las lecturas se realizan al abrir, después de acciones o con **Actualizar lectura**. No hay polling ni reintento automático de escritura desde el navegador. El procesamiento HCS y mantenimiento diario siguen en el servidor S10.

Al cerrar S14, el enlace público era interno y validado por UUID; copiar usaba el origen de la página, sin cookies ni parámetros privados. S15 sustituye esa sección por el [componente compartido de enlace y QR](trazabilidad-publica-y-qr.md), basado en el origen configurado, y completa la página pública y contraste remoto explícito. La navegación sin JavaScript muestra una explicación: la operación interactiva requiere JavaScript.

## Direction contract

Modo **Operate**, extensión del sistema S13. No se cambia la identidad; `DESIGN.md` y `.impeccable/design.json` se preservan. El contrato se registra aquí para continuar la superficie en futuras sesiones.

THESIS: una tarea vigente destacada para completar el recorrido sin ocultar el contexto guardado ni confundir operación y red.

OWN-WORLD: superficie clara, petróleo/teal, títulos Barlow Semi Condensed y cuerpo del sistema. Primitivos compartidos, reglas, datos tabulares y controles nativos; sin nuevas fuentes ni tokens globales.

STORY: comenzar o retomar, representar explícitamente el rol necesario, tomar una decisión y reconocer el resultado guardado y su evidencia pendiente o confirmada.

FIRST VIEWPORT: estado y progreso visibles, rol y tarea como centro de la operación; resumen a un lado en escritorio y después de la acción en móvil. Economía, evidencia e historial desplegables. Los cierres alternativos sustituyen los pasos futuros por “No aplica”.

FORM: tarea actual destacada, opción confirmada al planificar; inicio con botón, roles explícitos, reinicio anticipado confirmado, coma o punto y publicación de lo editado. Construcción directa en código dentro del sistema establecido, sin nuevo seed visual.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verificación y límites de entrega

Pasaron TypeScript, validación Prisma y build de producción; las rutas de API siguen iguales y `/demo` conserva su estructura estática con lecturas y escrituras desde el cliente. La revisión estática examinó contratos, extracción equivalente del schema, aislamiento de imports, intenciones, conflictos, caducidad, tres ramas, decimales y evidencia ficticia. La revisión documental confirmó que puede preservarse el sistema visual existente; se ajustaron el historial desplegable y la fuente de los títulos de viaje.

**Veredicto visual: `recapture`.** CUA devuelve `apps: []`, `browsers: []`. Faltan capturas a 1440/390 px y comprobación real de foco, teclado, reflujo y estados. No se acredita accesibilidad o comportamiento HTTP observado a partir de tipos/build/revisión estática. Se requiere nueva revisión completa con navegador disponible.

No se crearon ni ejecutaron suites, sesiones, recorridos, contactos, mantenimiento o mensajes testnet para comprobar esta entrega. S17/S18 conservan las pruebas: inicio y recarga, tres ramas, cuarto recorrido, precisión y separadores, humedad, viajes, diferencia de un gramo, aislamiento, conflictos entre pestañas, respuesta perdida/replay, POST guardado con GET fallido, caducidad, cuotas y reintento/reconciliación HCS. No hubo commit, push ni despliegue.
