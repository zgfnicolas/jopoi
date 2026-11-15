# S22-09 · Problem Details y contrato HTTP verificable

## Transición entre versiones

El boundary negocia errores RFC 9457 por `Accept`. Un cliente que pide explícitamente `application/problem+json` con calidad positiva, no menor que JSON, recibe esa representación. Si no lo pide, lo excluye con `q=0` o prefiere JSON, conserva el cuerpo anterior `{ error: { code, message, requestId, fields? } }` y `application/json`. No se retira esa compatibilidad ni se fija una fecha de retiro en este ticket.

Los tres transportes frontend piden `application/problem+json, application/json;q=0.9` y admiten ambos formatos. Esto permite desplegar primero cualquiera de las dos versiones: frontend nuevo con servidor anterior, o frontend anterior con servidor nuevo. El media type se compara sin parámetros y sin aceptar coincidencias parciales como `application/json-extra`.

El contrato nuevo contiene `type`, `title`, `status`, `detail`, `code`, `requestId`, `traceId` y campos opcionales. `type` es un URN estable `urn:jopoi:problem:<codigo-en-minusculas-con-guiones>`; no requiere publicar una página para resolverlo. `requestId` coincide con `X-Request-Id`; `traceId` identifica la traza técnica del ticket 08. No se agrega `instance`, evitando URLs o identificadores privados. El código HTTP real conserva su semántica.

Los clientes comprueban forma, código conocido, correspondencia entre código/status HTTP y, para Problem Details, status declarado y tipo esperado. No muestran títulos, detalles o mensajes externos arbitrarios: usan el catálogo público local y mensajes propios por campo. Un documento desconocido o malformado no confirma éxito, incluso si llega con 200, y no genera otro requestId de intención ni un reintento automático.

La elección se basa en [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), que define la representación y admite extensiones. La política concreta de negociación y compatibilidad pertenece a esta aplicación.

## Privacidad, plazos y recuperación

El serializador permite únicamente nombres de campos conocidos y reemplaza sus mensajes por textos públicos fijos. Nunca reproduce valores recibidos, claves desconocidas ni mensajes del proveedor; los 5xx no incluyen errores de campo. La causa original continúa en el contexto privado del ticket 08. Los headers mantienen `no-store` y agregan `Accept` a `Vary`, conservando Cookie para BFF y Authorization para cron.

Los 429 del limitador conservan el plazo real calculado para su ventana. `ApplicationError` permite declarar un plazo conocido de recuperación para 503; se omite cuando no se conoce, como ante una caída de PostgreSQL. No se inventa una espera fija para una dependencia indisponible. Los transportes admiten segundos no negativos y fechas HTTP IMF-fixdate, acotados a un día; una fecha pasada representa cero segundos y una fecha inválida se descarta. Cuando está disponible, Date del servidor evita depender del reloj del navegador.

El formulario conserva datos y los mismos bytes ante 429, 503 e incertidumbre. El panel conserva la intención de un comando con respuesta desconocida. La recuperación exige una acción manual y reutiliza la intención capturada; no se agrega una política de retries ni se cambia el control de concurrencia del dominio.

## OpenAPI actual y evolución

[El artefacto publicado](../public/openapi.json) está disponible como `/openapi.json` y declara OpenAPI 3.2.0: once paths, doce operaciones y quince schemas. Describe rutas reales, métodos, entradas, respuestas, códigos, headers, cookies, Bearer de cron, límites actuales, ejemplos sintéticos y estados asíncronos de publicación. Declara expresamente la excepción heredada del GET administrativo con efectos. No incorpora rutas futuras, ETag, sesiones `__Host-`, CSRF nuevo ni capacidades de tickets posteriores.

`scripts/lib/openapi.ts` genera los Schema Objects desde los validadores usados por la aplicación. Los schemas HTTP de comandos e intenciones ahora se comparten con el documento; se conserva su validación estricta y normalización. La generación usa la forma JSON de entrada de Zod. Refinamientos entre campos, reglas de dominio e integridad de evidencia siguen comprobándose por las pruebas funcionales; no se presentan como garantías expresables íntegramente en JSON Schema.

Ejecutá `npm run api:generate` al cambiar un contrato y revisá el artefacto. `npm run api:check` falla si quedó desactualizado. `npm run test:contracts` valida la estructura contra una copia fijada del [esquema oficial OpenAPI 3.2](https://spec.openapis.org/oas/3.2/schema/2025-09-17), compila cada Schema Object y contrasta rutas/métodos con los exports reales de Next. La puerta completa ejecuta estos controles.

Ajv y ajv-formats, ya presentes transitivamente, pasan a ser dependencias directas de desarrollo fijadas. No se agregan librerías de producción. La copia oficial, su hash y el tratamiento de anchors dinámicos se explican en [vendor/README](../tests/contracts/vendor/README.md). La primera validación detectó esa limitación de Ajv; la resolución estática conserva el destino del anchor y se comprueba con casos negativos. El archivo oficial permanece intacto.

La licencia del esquema se conserva en [openapi-license.txt](third-party/openapi-license.txt), copiada del [repositorio oficial de OpenAPI](https://github.com/OAI/OpenAPI-Specification/blob/main/LICENSE). Corresponde a esa copia de terceros y no cambia la licencia de los demás archivos del proyecto.

El cliente del arnés HTTP valida cada respuesta de una operación documentada contra el artefacto publicado, además de sus assertions funcionales. También comprueba `no-store` y UUID de diagnóstico. Las respuestas automáticas HEAD/OPTIONS/405 y las rutas inexistentes que resuelve el framework quedan fuera del inventario de DTOs de la aplicación.

## Evidencia local

- Ocho pruebas de contrato aprobadas: estructura oficial y controles negativos, inventario, ambos formatos en los tres transportes, códigos desconocidos, respuestas malformadas, negociación, Retry-After y boundary Next con 503/plazo conocido y sin datos privados.
- Tres escenarios HTTP focalizados aprobados con PostgreSQL efímero y ledger controlado: compatibilidad, validación y límite con replay, fallo SQL inesperado y dependencia caída. El contraste con el artefacto OpenAPI estuvo activo.
- Lint y compilación TypeScript estricta aprobados antes de la regresión integral.

### Preparación del navegador y recuperación del arnés

Dos preparaciones terminaron con TimeoutError antes de ejecutar casos. Una tercera, con etiquetas de fase nuevas y el mismo presupuesto de 60 segundos, identificó `BLOCKED_NEXT_WARMUP_PAGE_1`: la lectura de `/demo`. Los logs de Webpack mostraban además que Watchpack inspeccionaba archivos del sistema en la raíz de C:. La invocación final usa el CLI directo de Playwright para pasar el filtro como un argumento, evitando la interpretación de `|` por el shell de npm en Windows.

Después de consultar la guía instalada de Next 16.4.2 y su configuración real, se acotó el watcher **solo en el entorno E2E validado por marker**. Conserva la exclusión original de Next y omite rutas fuera del workspace. Si cambia la forma esperada de esa configuración, falla explícitamente. El retorno de configuración de producción y el arnés API/Turbopack permanecen sin ese callback. No se amplían timeouts ni se eliminan assertions. El calentamiento agrega ahora fase y causa privada a sus fallos, en lugar de presentar un aborto genérico.

Con este ajuste aprobaron **6/6 escenarios**, tres en Chromium desktop y tres en WebKit móvil emulado: caída real de PostgreSQL durante contacto, 429 nuevo seguido de 503 anterior y reintento con los mismos bytes, y comando con respuesta desconocida seguido de reintento manual idéntico. Duración total 8,9 minutos, incluyendo preparación; no es una medición del producto. Artefactos: `.cache/s22-09-e2e.log`, `.cache/s22-09-e2e-repeat.log`, `.cache/s22-09-e2e-diagnosed.log`, `.cache/s22-09-e2e-workspace.log` y `.cache/e2e/html/index.html`. No se repitió la matriz completa de temas claro/oscuro ni el laboratorio SEO.

Observación de navegador: `2026-10-31T21:01:22.456Z`; revisión base `d76dff57d0bfea70c5f567be6333f0facd8b13e2` con cambios locales sin commit; huella de fuentes `1ed4c63ee578e452859fb40c25de303c98cdce7b2204ec63f4b3e8a589860c5e`. El reporte del proceso declara `passed`; el HTML y el log detallan los seis casos seleccionados. El reporte agregado conserva bloqueada la aceptación de la matriz completa que no se ejecutó.

### Primera puerta integral y repetición

La primera puerta aprobó todos los controles previos a HTTP y terminó con **54/55 HTTP aprobadas**. S21-01 esperaba veinte creaciones y cuatro rechazos entre dos instancias; obtuvo trece creaciones y errores de transacción `P2028`. El colector privado permitió identificar ese código y duraciones próximas al presupuesto de adquisición. Esto no demuestra por sí solo una causa raíz ni elimina la posibilidad de intermitencia.

La repetición aislada de S21-01 aprobó en 7,49 segundos, sin cambiar código, pool, presupuestos, concurrencia ni assertions. Se conserva el primer intento y su reporte en `.cache/s22-09-quality.log` y `.cache/s22-09-api-initial-report.json`; el aislado está en `.cache/s22-09-s21-01-repeat.log`.

La segunda ejecución de `npm run quality:check` terminó con código cero: Prisma generado y validado, tipado principal/API, lint, informe estricto con **cero diagnósticos**, artefacto OpenAPI vigente, **8 pruebas de contrato, 9 controles de calidad, 7 de seguridad, 54 de dominio/persistencia, 4 de observabilidad, 23 CLI, 2 de tokens, 55/55 HTTP y build de producción**. HTTP tardó 412,75 segundos en este equipo. Se conservan el mismo código, pool, presupuestos y assertions de la primera tanda; no se presenta una repetición aprobada como prueba de que la intermitencia dejó de existir.

Observación HTTP: `2026-10-31T21:26:10.259Z`, cero errores de arranque. Revisión base `d76dff57d0bfea70c5f567be6333f0facd8b13e2`, árbol con cambios sin commit; huella `1ed4c63ee578e452859fb40c25de303c98cdce7b2204ec63f4b3e8a589860c5e`, coincidente con la de navegador. Artefactos finales: `.cache/s22-09-quality-repeat.log`, `.cache/api-tests/results/report.json`, `.cache/quality/strict-report.json` y `.cache/s22-09-strict-final.log`. El snapshot estricto legible se conserva en [s22-02-diagnosticos-estrictos.md](s22-02-diagnosticos-estrictos.md).

No se usaron la base habitual, datos reales de contacto ni HCS real; no hay despliegue ni cambios de esquema. El ticket 09 queda completado y validado localmente el 2026-10-31. La ejecución remota del workflow y la aceptación global de S22 siguen pendientes. Se espera confirmación para implementar el 10.
