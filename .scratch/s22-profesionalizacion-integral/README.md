# S22 · Tickets aprobados

Estado: desglose de 32 tickets y dependencias aprobado por el usuario; publicación pendiente de configuración del tracker. Todavía no se aplicó ready-for-agent.

Fuente: [spec S22](../../docs/specs/22-profesionalizacion-integral-y-confiabilidad.md). Revisión de origen: e5f54a5b8b79727e8c8c933761e4a5fbe8d1e62c. SHA-256 de la spec: 8c39f320e466d5185be1543b49132bdbb50386574ac5ba19483b9636bc7f628a.

Hay **32 tickets aprobados individualmente documentados**, con criterios de aceptación y bloqueos concretos. Se cubren **88 historias, 21 decisiones, 17 hallazgos y 32 escenarios**. Se conservan en drafts hasta configurar su publicación. Las pruebas y contratos se incorporan al comportamiento que entregan, no en una fase horizontal posterior.

## Antes de publicar

La aprobación ya fue recibida: «Me parece bien esos tickets». No hace falta volver a pedir aprobación de granularidad o dependencias. Sigue pendiente configurar el destino con /setup-matt-pocock-skills; si el destino es local se publicará un archivo por ticket en issues, y si es remoto se publicarán issues en orden de dependencias. Se aplicará ready-for-agent al publicar este desglose aprobado. No se modifica ni se cierra una issue padre.

El manifiesto plan.json registra la aprobación y conserva los IDs y aristas para comprobar consistencia y evitar pérdida de cobertura al publicar. El destino todavía no está elegido: la existencia de archivos locales no equivale a configurar un tracker local.

## Excepción de refactor amplio

Los tickets 02–07 secuencian el cambio mecánico de tipado mediante expansión, migración por área y retirada final. El perfil actual mantiene la puerta verde entre lotes; el perfil completo conserva visibles los diagnósticos hasta exigirse sin excepciones en 07. Los tickets 03–06 preservan consumidores anteriores. No se elimina compatibilidad HTTP al retirar formas temporales de tipos. Es la excepción expand–contract de la habilidad, no una división general del producto por capas.

Las demás entregas tienen un comportamiento verificable de punta a punta. No se crean cambios de esquema, API, UI o tests como tickets aislados cuando son parte necesaria del mismo flujo. Las herramientas de calidad y operación se verifican mediante sus propias interfaces y artefactos.

## Desglose aprobado

1. **[Resolver los avisos de seguridad del SDK de Hedera](drafts/01-dependencias-hedera-seguras.md)** · Bloqueado por: ninguno. Mantener guardado, publicación y contraste del recorrido con una cadena de dependencias reproducible libre de los dos avisos conocidos de ws, sin perder compatibilidad ni degradar el SDK a ciegas.

2. **[Preparar verificaciones reproducibles y la expansión del tipado estricto](drafts/02-preparar-calidad-y-migracion-estricta.md)** · Bloqueado por: ninguno. Permitir que cada cambio se verifique de forma reproducible y que la migración de tipado avance por lotes sin romper el desarrollo entre entregas.

3. **[Introducir contratos operativos válidos junto a los actuales](drafts/03-expandir-contratos-operativos.md)** · Bloqueado por: 02. Habilitar una migración gradual a estados de operación e intenciones representables con seguridad, manteniendo compatibles los recorridos y recibos existentes.

4. **[Guardar y recuperar operaciones con invariantes semánticas](drafts/04-operaciones-persistidas-validas.md)** · Bloqueado por: 03. Asegurar que una operación confirmada, su historial y su recuperación desde SQL correspondan siempre a un estado válido del dominio.

5. **[Mantener edición y reintentos del panel con intenciones tipadas](drafts/05-intenciones-ui-tipadas.md)** · Bloqueado por: 03. Permitir al participante editar, resolver conflictos y reintentar una respuesta incierta con una intención coherente y sin duplicar efectos.

6. **[Validar CLI, configuración y arneses con tipos estrictos](drafts/06-cli-configuracion-pruebas-estrictas.md)** · Bloqueado por: 02. Dar al responsable herramientas operativas que rechacen argumentos o recursos incompletos y a los mantenedores pruebas aisladas sin incertidumbres de tipos ocultas.

7. **[Activar el perfil estricto completo y retirar compatibilidad de tipos](drafts/07-exigir-perfil-estricto-global.md)** · Bloqueado por: 04, 05, 06. Impedir que se integre código que deje estados o accesos inciertos después de completar la migración de todos los consumidores.

8. **[Investigar fallos desde una referencia pública segura](drafts/08-diagnosticos-correlacionados.md)** · Bloqueado por: ninguno. Permitir que el responsable encuentre el diagnóstico de un error informado por un visitante sin exponer contactos, credenciales o detalles internos.

9. **[Entregar errores RFC 9457 comprendidos por toda la interfaz](drafts/09-problem-details-contrato-base.md)** · Bloqueado por: 08. Mostrar errores uniformes e investigables en lectura, operación y solicitud de demo, con un contrato HTTP verificable y sin perder intenciones al cambiar el formato.

10. **[Acotar la creación diaria de sesiones y solicitudes de demo](drafts/10-admision-sesiones-contactos.md)** · Bloqueado por: 09. Aceptar nuevas sesiones y contactos reales sólo dentro de una capacidad diaria compartida y explicar el rechazo sin perder los datos del visitante.

11. **[Limitar intenciones y proteger las lecturas y comandos privados](drafts/11-limites-recorridos-intenciones.md)** · Bloqueado por: 10. Permitir que el propietario opere y consulte sin que otra sesión, o cientos de claves distintas, agoten recibos y capacidad compartida.

12. **[Eliminar vencidos con limpieza justa y recuperable](drafts/12-limpieza-sostenible.md)** · Bloqueado por: 11. Eliminar datos vencidos de forma sostenible y recuperar atraso sin bloquear toda la operación ni presentar una limpieza parcial como completa.

13. **[Rechazar cuerpos lentos y lecturas que exceden su presupuesto](drafts/13-deadlines-cancelacion-http.md)** · Bloqueado por: 09. Conservar capacidad y mensajes seguros cuando una lectura, una dependencia o un cliente lento no completan dentro del tiempo permitido.

14. **[Publicar y contrastar con capacidad global y recuperación segura](drafts/14-capacidad-global-hcs-reintentos.md)** · Bloqueado por: 11, 13. Procesar publicaciones y contrastes sin saturar dependencias ni duplicar transacciones, incluso con varias instancias, caída o resultados inciertos.

15. **[Proteger la sesión HTTPS y sus mutaciones con CSRF](drafts/15-cookie-host-y-csrf.md)** · Bloqueado por: 09. Recuperar una sesión y ejecutar acciones legítimas con una cookie restringida al host y un token CSRF vinculado, sin exponer la credencial de autenticación.

16. **[Cerrar sesiones y hacer efectivo el vencimiento por inactividad](drafts/16-revocacion-expiracion-sesion.md)** · Bloqueado por: 15. Permitir que el visitante cierre su sesión y que una sesión abandonada deje de autorizar datos privados sin borrar la evidencia pública vigente.

17. **[Editar la operación con If-Match e Idempotency-Key](drafts/17-edicion-etag-idempotency-key.md)** · Bloqueado por: 04, 11, 15. Aplicar una edición del recorrido una sola vez y rechazar versiones viejas con un contrato HTTP estándar comprendido por el panel.

18. **[Consultar trazabilidad pública versionada y condicional](drafts/18-api-publica-versionada-condicional.md)** · Bloqueado por: 09. Permitir que consumidores públicos consulten trazabilidad con una versión explícita y validadores correctos, preservando los enlaces existentes y la vigencia del recurso.

19. **[Mostrar el historial inicial sin JavaScript y con status real](drafts/19-historial-inicial-sin-javascript.md)** · Bloqueado por: 18. Permitir abrir una trazabilidad y leer su historial inmediatamente, aun sin JavaScript, recibiendo un status HTTP real si no está disponible.

20. **[Hacer visible la antigüedad y actualizar antes de editar](drafts/20-frescura-operacion-y-trazabilidad.md)** · Bloqueado por: 17, 19. Ayudar al participante y al lector a distinguir la última lectura de un estado actual y evitar escribir desde una vista demasiado antigua.

21. **[Aplicar CSP estricta sin romper tema, formularios ni QR](drafts/21-csp-y-cabeceras-efectivas.md)** · Bloqueado por: 19. Proteger las páginas frente a scripts y frames no autorizados manteniendo operativa la demo y una decisión explícita sobre render estático o dinámico.

22. **[Recuperar y exportar sólo los datos necesarios](drafts/22-proyecciones-y-exportacion-eficientes.md)** · Bloqueado por: 04. Mantener replay, lectura y exportación de contactos correctos con menos transferencia y memoria, usando evidencia de consultas para cualquier índice nuevo.

23. **[Seguir una acción desde HTTP hasta SQL, HCS y cron](drafts/23-trazas-distribuidas-y-exportacion-segura.md)** · Bloqueado por: 08. Reconstruir el recorrido técnico completo de una acción, incluso si su publicación ocurre después, con contexto distribuido y un exportador que no afecte al servicio.

24. **[Medir latencia, saturación y atraso con cardinalidad acotada](drafts/24-metricas-capacidad-y-atraso.md)** · Bloqueado por: 12, 14, 23. Permitir al responsable saber si la aplicación responde, qué recurso se satura y cuánto trabajo de publicación o limpieza está atrasado.

25. **[Detectar incidentes con salud, objetivos y alertas accionables](drafts/25-salud-slos-alertas-runbooks.md)** · Bloqueado por: 24. Avisar al responsable cuando se degrada el servicio, falta el cron o crece el atraso, indicando qué hacer sin reiniciar por reflejo una instancia sana.

26. **[Medir la experiencia real sin exportar datos privados](drafts/26-rum-privado-y-percentiles-reales.md)** · Bloqueado por: 10, 19, 23. Medir LCP, INP y CLS de visitantes por ruta y dispositivo sin convertir telemetría en una fuga de datos o una nueva vía de agotamiento.

27. **[Mantener rápidas las tres rutas con un gate de producción](drafts/27-presupuestos-frontend-y-laboratorio.md)** · Bloqueado por: 20, 21. Conservar lectura e interacción ágiles en landing, demo y trazabilidad y bloquear regresiones de carga, layout o JavaScript antes de una entrega.

28. **[Dimensionar admisión y pool con carga de producción](drafts/28-ensayo-capacidad-pool-localidad.md)** · Bloqueado por: 22, 24, 27. Obtener un techo de admisión respaldado por mediciones y un modelo global de conexiones, para sostener el servicio dentro del presupuesto gratuito.

29. **[Ensayar migraciones y restauración sin alterar evidencia](drafts/29-rollout-restauracion-sin-perdida.md)** · Bloqueado por: 04, 12, 14, 16, 23. Actualizar y recuperar la aplicación de manera reanudable sin perder operaciones, romper consumidores previos ni confundir restauración SQL con reversión de HCS.

30. **[Cerrar la entrega local con regresión y evidencia reproducibles](drafts/30-release-reproducible-y-evidencia-local.md)** · Bloqueado por: 01, 07, 25, 26, 28, 29. Producir una revisión candidata verificable que reúne todos los flujos S22 y comunica con precisión qué está implementado y qué falta probar fuera del entorno local.

31. **[Acreditar seguridad, capacidad y recuperación del candidato](drafts/31-aceptacion-operativa-candidato.md)** · Bloqueado por: 30. Demostrar en el entorno gratuito seleccionado que lo verificado localmente se conserva en el hosting y el proveedor, registrando cualquier bloqueo real.

32. **[Validar resultados de campo y cerrar los seis DoD](drafts/32-aceptacion-campo-y-cierre-s22.md)** · Bloqueado por: 31. Permitir que el responsable acepte la profesionalización sólo cuando todas las brechas aplicables tengan evidencia local, operativa y real suficiente.

## Frontera y bloqueos externos

- Frontera inicial sin bloqueos de tickets: **01, 02 y 08**.
- Luego se toma cualquier ticket cuyos bloqueantes estén terminados; el número es un orden topológico, no obliga a una cola totalmente secuencial.
- Los tickets 31 y 32 requieren además acceso/autorización del candidato y evidencia de campo suficiente. Esos requisitos no se sustituyen por terminar un ticket anterior. Si faltan se conserva el bloqueo externo y no se aprueba por omisión.
- La autorización de este desglose o su publicación no autoriza gastos, despliegues, restauraciones remotas ni mensajes reales; las operaciones futuras respetan sus condiciones de seguridad.

## Comprobación de cobertura

- Historias: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88.
- Decisiones: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12, D13, D14, D15, D16, D17, D18, D19, D20, D21.
- Hallazgos: AUD-01, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06, AUD-07, AUD-08, AUD-09, AUD-10, AUD-11, AUD-12, AUD-13, AUD-14, AUD-15, AUD-16, AUD-17.
- Casos: S22-01, S22-02, S22-03, S22-04, S22-05, S22-06, S22-07, S22-08, S22-09, S22-10, S22-11, S22-12, S22-13, S22-14, S22-15, S22-16, S22-17, S22-18, S22-19, S22-20, S22-21, S22-22, S22-23, S22-24, S22-25, S22-26, S22-27, S22-28, S22-29, S22-30, S22-31, S22-32.

Todos los cuerpos individuales se redactaron sin rutas de implementación ni snippets y mantienen el lenguaje del glosario. No se instalaron dependencias ni se ejecutaron operaciones del producto para preparar estos borradores.

