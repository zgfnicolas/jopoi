# S18 · Pruebas E2E y aceptación final

La suite usa navegadores reales contra Next.js local, PostgreSQL exclusivo y HCS/mirror controlados. La aceptación del candidato publicado y de cinco hitos reales de testnet se ejecuta por separado. Aprobar la suite local no acredita esos requisitos externos.

## Ejecución local

Requiere Node 24, dependencias instaladas, cliente Prisma generado (`npm run db:generate`) y los binarios PostgreSQL 17 de `.tools/postgresql/`. Comparte la preparación segura de [S17](pruebas-api-e-integracion.md), sin usar el clúster de desarrollo ni las conexiones de `.env.local`.

```sh
npx --no-install playwright install chromium webkit
npm run test:e2e
npm run test:api
npm run acceptance:check
```

La instalación descarga motores gratuitos; no crea cuentas ni servicios. Ejecutar API y E2E secuencialmente: un lock común evita que dos ejecuciones compartan la caché de Next. Cada ejecución crea su propio clúster, aplica las migraciones existentes y usa credenciales sintéticas. Al finalizar detiene sus procesos y elimina exclusivamente su clúster y contraseña. Si se interrumpe por la fuerza, seguir la recuperación del lock documentada en S17.

`npm run test:e2e -- --grep E2E-08` selecciona un caso. Los informes no aprueban escenarios omitidos ni una matriz ejecutada en un solo navegador. No hay reintentos automáticos del ejecutor.

Los perfiles son Chromium de escritorio (1440 × 900) y WebKit con emulación iPhone 13 (390 × 844). El caso de accesibilidad comprueba el recorrido por teclado en escritorio, controles táctiles y foco en móvil, y anchos 320, 768 y 1440 en escritorio. Esto no certifica accesibilidad ni sustituye una comprobación con un teléfono físico.

## Frontera y preparación

Las acciones se realizan mediante etiquetas, roles y textos visibles. Se recorren conformidad, rechazo e incidencia, recuperación y tres exploraciones, contacto con fallo SQL y reintento idempotente, QR, consulta compartida, estados HCS y vencimientos. El QR se decodifica con `jsqr`, independientemente de la librería que lo genera. La consulta compartida abre otro contexto sin la cookie privada y comprueba que no recibe permisos de edición.

La comprobación móvil detectó pérdida de una escritura anterior a la hidratación del formulario de contacto. Los campos y el envío permanecen deshabilitados hasta que el componente está listo, para evitar esa pérdida. El caso verifica los valores antes del envío, el foco en el primer campo inválido y la conservación posterior ante fallo SQL.

El entorno permite controlar únicamente reloj y frontera HCS/mirror mediante la composición de pruebas existente. No hay endpoints públicos para controlar fixtures. Las aserciones observan interfaz, HTTP y la exportación administrativa; no consultan tablas ni importan reglas de negocio privadas. PostgreSQL se detiene realmente para comprobar el fallo de contacto. Los CSV sintéticos se eliminan después de leerlos.

El servidor toma una hora inicial actual por escenario. El reloj del navegador conserva su comportamiento nativo salvo en el caso explícito de vencimientos. Las barreras de red y consultas acotadas esperan estados observables. Si aparece el conflicto documentado de versión, el helper utiliza la revisión visible, recupera el borrador y realiza una nueva acción explícita una vez; no reproduce escrituras con resultado incierto.

El servidor E2E local usa `next dev --webpack`, con salida `.cache/e2e/next`, y compila las páginas antes de conectar el navegador. En este entorno, Turbopack produjo recargas de HMR que interrumpían las tareas; Webpack y la preparación de páginas resolvieron el caso reproducido. Esta elección solo afecta a E2E: S17 conserva su configuración y el build normal conserva adaptadores reales. Los controles de prueba siguen prohibidos en producción y verifican marca de propiedad, origen y SQL en loopback.

Actualización S19: la preparación de Webpack también compila las entradas API utilizadas por la suite antes de abrir el navegador. La primera regresión observó peticiones iniciales canceladas cerca del límite de 15 segundos; preparar solo lectura y comandos permitió aprobar dos casos aislados, pero una nueva pasada detectó el mismo problema en la ruta de reinicio. La preparación cubre ahora todas las entradas usadas, mediante GET sin cookies a recursos protegidos, inexistentes o métodos no admitidos, sin ejecutar comandos ni consumir cuota. La fixture de página tiene un presupuesto separado de 180 segundos para preparar el entorno; se conservan los 120 segundos del cuerpo de prueba, los límites de acciones/aserciones y los 15 segundos del cliente. No se añaden reintentos. Ver [timeouts de fixtures de Playwright](https://playwright.dev/docs/test-timeouts#fixture-timeout). Las trazas iniciales se conservan en `.cache/e2e/diagnostics/s19-initial/`.

## Evidencia local

Actualización S20: la matriz conserva los proyectos claros `chromium-desktop` y `webkit-mobile` y añade sus variantes `-dark`. Los recorridos existentes se ejecutan en los cuatro proyectos. `S20-01` añade axe, semántica, formularios y temas sobre inicio/panel/traza; `S20-02` comprueba fallback sin JavaScript, Storage bloqueado, sincronización entre pestañas y bootstrap sin hidratación. Reportero y agregador exigen las cuatro variantes y los dos casos nuevos para la comprobación UI automática; una ejecución parcial no aprueba la matriz. Esto no acredita lector de pantalla ni conformidad WCAG completa.

La precarga del harness incluye también los scripts, CSS y fuentes locales enlazados por el HTML; termina compilando las entradas API después del grafo cliente. Una precarga inicial se ejecuta en setup global y cada página se crea después del reinicio aislado. La configuración de pruebas activa la optimización de memoria de Webpack documentada por la versión instalada de Next; no se activa en producción. Las capturas se adjuntan mediante archivos; la traza retiene red y DOM, sin filmstrip ni copias de fuentes. Las capturas visuales explícitas y de fallo permanecen disponibles.

La máquina de validación dispone de 3,8 GB de RAM y se observaron cancelaciones del cliente con unos 380 MB libres. Se mantienen todos los presupuestos de S19 y la política de no reintentar escrituras inciertas. Resultados y limitaciones: [validación S20](s20-validacion.md).

- `.cache/e2e/report.json` y `report.md`: E2E-01–E2E-15, entorno, fecha, revisión, huella de fuentes y resultados por navegador.
- `.cache/e2e/html/index.html`: informe con capturas de los recorridos y tamaños observados.
- `.cache/e2e/artifacts/`: capturas y trazas de fallos para diagnóstico. Contienen datos de prueba y pueden contener cookies sintéticas; son archivos privados ignorados por Git.
- `.cache/api-tests/results/`: evidencia de API-01–API-26.
- `.cache/acceptance/report.json` y `report.md`: resultado agregado y trazabilidad con los 14 criterios del alcance.

Las capturas son evidencia para revisión, sin comparaciones automáticas contra imágenes generadas. La matriz distingue APROBADO, FALLIDO y BLOQUEADO. El agregador exige informes de fuentes coincidentes y antigüedad máxima de siete días; un cambio ejecutable requiere volver a verificar. La aceptación global requiere además un árbol limpio y evidencia externa del mismo commit publicado.

## Preparar la aceptación externa

No se provisiona ni publica infraestructura desde estas herramientas. Primero debe existir un candidato configurado según [S16](despliegue-gratuito.md), en Vercel Hobby, Neon Free y Hedera testnet, con presupuesto cero, sin tarjetas ni upgrades. El archivo de entorno se selecciona explícitamente; no se recurre a credenciales locales implícitas.

Copiar [la plantilla de evidencia v2](acceptance-provider-evidence.example.json) a `.cache/acceptance/providers.json`. Es deliberadamente inválida y no acredita una revisión. Comprobar desde Vercel URL, commit, fechas UTC, planes sin pagos y cron diario real `0 3 * * *`. S19 exige además integración nativa, base aprovisionada desde Marketplace, credenciales sincronizadas, conexión solo a Production y ausencia de cuenta independiente. Los IDs del proyecto y de la conexión deben coincidir con `.vercel/project.json`; el ID del recurso se registra desde Vercel. Guardar artefactos sin secretos ni datos personales dentro de `.cache/acceptance/` y sus SHA-256 (`Get-FileHash -Algorithm SHA256`). Se exigen `reviewed: true`, hashes coincidentes y observaciones de hasta siete días. Los manifiestos v1 se rechazan. Es revisión documental, no auditoría automática de cuentas o facturación. Los comandos admiten `--vercel-env-file` como alternativa al selector estricto; ver [procedimiento S19](persistencia-gestionada-desde-vercel.md).

```sh
npm run acceptance:check -- --env-file .env.candidate.local --evidence .cache/acceptance/providers.json --journal .cache/acceptance/testnet.json
```

`check` solo lee archivos y valida configuración offline. No inicia navegador, SQL ni llamadas de red. Sin candidato o evidencia suficiente escribe un informe bloqueado y devuelve 1. La ayuda no carga el entorno, incluso si se proporciona un archivo inexistente:

```sh
npm run acceptance:check -- --help
npm run acceptance:live -- --help
```

## Ejecutar cinco hitos reales cuando corresponda

Este paso requiere una ejecución expresamente autorizada contra el candidato seleccionado, commit limpio, manifiesto revisado, operador/topic existentes y saldo ficticio suficiente. No ejecutarlo para completar una comprobación local.

```sh
npm run acceptance:live -- --run --env-file .env.candidate.local --evidence .cache/acceptance/providers.json --journal .cache/acceptance/testnet.json
```

El guard exige `--run` y los tres archivos explícitos antes de abrir el navegador. Crea un único recorrido sintético mediante la UI y comprueba cupo para cinco envíos antes de publicar, aprobar, asignar, retirar y recibir. No crea topics, cuentas, despliegues ni servicios. Si faltan permisos, saldo o disponibilidad, conserva el bloqueo; no compra recursos ni declara éxito simulado.

Cada hito confirmado se contrasta directamente con el Mirror Node de testnet, comprobando transacción exitosa, topic, pagador configurado, secuencia, timestamp, sobre y digest del detalle. La canonicalización de comprobación utiliza un orden de campos v1 independiente del módulo del producto. Una discrepancia falla la aceptación; la ausencia de confirmación la bloquea. Las consultas tienen límites y no reenvían transacciones.

El journal registra identificador público del recorrido y, por hito, eventId, ordinal, tipo, transactionId, topic, secuencia, timestamp, digest y resultado. No guarda cookies, claves ni estado privado del navegador. Registra el recorrido antes del primer hito para reducir el riesgo de repetirlo tras una interrupción.

Reutilizar el mismo journal activa recuperación de **solo lectura** del recorrido conocido: no abre otro recorrido ni repite acciones. Ante un camino parcial, consultar los pendientes y resolver la continuidad en la sesión original o mediante la operación autorizada de S16. Una pérdida de sesión no concede permiso para crear otro recorrido automáticamente. No borrar el journal para eludir cuotas ni intentar borrar mensajes de Hedera. Tras la comprobación, ejecutar `acceptance:check` con el mismo candidato, manifiesto y journal.

Los códigos son 0 para aprobado, 1 para fallido o bloqueado y 2 para argumentos inválidos. Los mensajes de error del CLI no imprimen conexiones ni claves.

## Validación local

El 27 de octubre de 2026 pasó la ejecución completa: **28 pruebas E2E**, 14 por perfil, sin reintentos del ejecutor. Los 13 casos locales de la matriz quedaron aprobados en ambos perfiles; E2E-09 incluye dos escenarios. Se revisaron capturas de landing, panel y consulta con detalle abierto. La cobertura de teclado corresponde a escritorio y la táctil a móvil emulado.

También pasó la regresión completa S17: **28 pruebas de API**, correspondientes a API-01–API-26. TypeScript, validación del esquema Prisma y build normal de producción fueron satisfactorios. `acceptance:check` reconoció la evidencia local vigente y devolvió **BLOQUEADO** (código 1) para la aceptación global, con E2E-12/13/14 pendientes de evidencia externa. Las ayudas funcionaron sin cargar entorno y `acceptance:live` sin argumentos obligatorios fue rechazado con código 2, antes de cualquier operación real.

Se comprobó la ausencia del lock, clústeres, contraseñas y archivo privado de recursos de las dos ejecuciones finales. El build normal no contiene los marcadores de los adaptadores controlados; `next-env.d.ts` quedó sin cambios respecto de Git.

## Límite de esta entrega

La implementación prepara la suite local y el mecanismo de aceptación externa. E2E-12 necesita cinco hitos reales; E2E-13 requiere evidencia del candidato gratuito; E2E-14 combina la protección y política comprobadas localmente con una ejecución real del programador publicado. Mientras falte cualquiera de esas evidencias, esas partes y la aceptación global permanecen bloqueadas. No se han creado recursos, realizado un despliegue ni enviado transacciones reales para esta entrega.

En esta ejecución no existen `.env.candidate.local`, vínculo local `.vercel/project.json`, manifiesto revisado de proveedores ni journal de cinco hitos reales. Se conserva esa ausencia como recuperación pendiente; no se infiere la configuración de cuentas externas.
