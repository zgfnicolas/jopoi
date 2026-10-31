# S22-08 · Diagnósticos correlacionados y seguros

## Comportamiento entregado

Cada boundary HTTP genera una referencia interna y devuelve `X-Request-Id`. En errores coincide con el `requestId` del cuerpo público existente. `AsyncLocalStorage` vincula esa referencia con las consultas SQL y el resultado de la solicitud; el trabajo inmediato de publicación captura un contexto hijo antes de registrarse con `after`.

Los identificadores tienen significados distintos:

| Campo del registro | Significado |
| --- | --- |
| `requestId` | Referencia pública UUID generada por el servidor para investigar una solicitud. |
| `traceId` | Identidad técnica local de 32 caracteres hexadecimales, denominada `telemetryTraceId` en el contexto interno. |
| `spanId`, `parentSpanId` | Relación entre boundary, consultas y trabajo diferido inmediato. |
| `businessTraceId` | UUID validado de la trazabilidad del producto, cuando se conoce. |

El visitante no puede fijar estas identidades mediante headers. No se incorporan `X-Request-Id`, `traceparent`, `tracestate` ni baggage externos. El cron inicia su propio contexto; los eventos del pool salen sin heredar la solicitud que creó una conexión.

## Exportación y privacidad

`src/server/diagnostics.ts` concentra la escritura de líneas JSON a stderr. Incluye timestamp, severidad, servicio y versión, entorno, evento, identidades, operación, método, ruta plantilla, código estable, resultado y duración. Las rutas provienen de un catálogo cerrado: no se exportan URLs, query strings, bodies ni headers. Los contadores admiten únicamente nombres y enteros no negativos conocidos.

Las traducciones SQL y los errores HCS conservan la causa original en memoria. Los resultados HCS mantienen su contrato JSON: una `WeakMap` guarda su causa sin agregar propiedades públicas ni persistirla. Antes de exportar, el logger reconstruye una descripción permitida de la cadena: tipo, código conocido y hasta cuatro ubicaciones de archivos propios por elemento. Nunca serializa mensajes, stack completo, SQL, parámetros, metadatos crudos, claves, bytes firmados ni objetos de proveedores. Se limita el recorrido a 16 elementos y seis descriptores, con detección de ciclos.

Cada línea tiene un máximo de 8 KiB. El transporte no mantiene una cola propia: descarta mientras stderr está bloqueado o averiado. Los errores al abrir o escribir stderr no reemplazan el resultado de negocio. Esta política entrega diagnósticos de mejor esfuerzo; no garantiza conservación durante una caída del colector. La telemetría de descartes y el exportador distribuido pertenecen al ticket 23.

## Clasificación y duración

El boundary registra una sola entrada `ERROR` para un fallo 5xx. Las capas SQL emiten su resultado y duración en `INFO`, sin repetir la excepción; una recuperación HCS usa `WARN`. Los 4xx esperados se muestrean por la última cifra de la referencia interna, con probabilidad 1/16: `INFO`, salvo 429 en `WARN`. Los 5xx no se muestrean. Esto no sustituye las métricas de errores ni el registro de seguridad previstos por tickets posteriores.

HTTP y SQL miden tiempo transcurrido con reloj monotónico. La duración del trabajo diferido incluye la espera desde su programación. Un marcador instantáneo, como `operation.committed`, declara duración cero. El CLI conserva su stdout funcional; la instrumentación SQL no inventa una solicitud HTTP para ejecuciones sin contexto.

## Investigación desde una referencia

Buscá en el colector privado el `requestId` informado por el cliente. La entrada `http.completed` identifica código, status, ruta plantilla y cadena saneada. Su `traceId` permite reunir consultas y publicaciones inmediatas; `parentSpanId` distingue sus relaciones. `businessTraceId` permite ubicar el recorrido del producto sin confundirlo con la identidad técnica. Los registros privados requieren el mismo control de acceso y retención que el resto de la observabilidad del sistema.

## Evidencia local

- `tests/observability/diagnostics.test.ts` usa un subproceso y su stderr real: 24 contextos asíncronos intercalados, 72 registros, ausencia de marcadores privados, límites de causa y separación de stdout. También verifica muestreo, traducciones reales del SDK sin red y supervivencia cuando el colector cierra el pipe.
- La prueba del pipe cerrado detectó inicialmente que Windows podía fallar al abrir stderr durante la importación. Se movió la apertura al bloque protegido del exportador y la prueba pasó sin relajar sus expectativas.
- `tests/api/diagnosticos.test.ts` consume el log real del servidor y las referencias de respuestas HTTP. Inyecta un error SQL privado, detiene PostgreSQL y provoca un fallo de programación con una respuesta controlada del ledger. Comprueba un único `ERROR`, causas útiles saneadas y ausencia de cookies, parámetros y marcadores privados. También relaciona commit, SQL, `after` y una ejecución cron con raíz independiente.
- Los tres escenarios HTTP focalizados aprobaron con PostgreSQL efímero y ledger controlado, sin llamadas HCS reales.

La puerta completa incorpora `test:observability` junto con las suites existentes. En la primera ejecución aprobaron tipado, lint, nueve controles negativos de calidad, siete pruebas de seguridad, 54 de dominio/persistencia, cuatro de observabilidad, 23 CLI y dos de tokens. HTTP terminó con 51/52 aprobadas: API-10 venció esperando la publicación inicial, antes de sus assertions de peso. El nuevo diagnóstico mostró `P2028` en una transacción del trabajo diferido; el evento quedó en cola. No se alteraron timeouts, assertions ni reglas de negocio. La repetición aislada de API-10 aprobó en 26,58 segundos. Artefactos: `.cache/s22-08-quality.log`, `.cache/s22-08-api-initial-report.json` y `.cache/s22-08-api10-repeat.log`. Esta observación no alcanza para demostrar la causa raíz del vencimiento ni elimina la posibilidad de intermitencia.

La segunda ejecución integral de `npm run quality:check` terminó con código cero: Prisma generado y validado, ambas compilaciones TypeScript, lint, informe estricto sin diagnósticos, nueve controles de calidad, siete pruebas de seguridad, 54 de dominio/persistencia, cuatro de observabilidad, 23 CLI, dos de tokens, **52/52 HTTP y build de producción**. HTTP tardó 745,44 segundos en este equipo; no es una medición de rendimiento del producto. No hubo cambios de código entre la primera tanda HTTP, la repetición aislada y la segunda puerta.

Revisión base: `ffe7673a91e22d8d554a7223c40c8f11d4bc2b22`, con cambios locales sin commit. Huella de fuentes HTTP: `88329b47590152d870ad37cf1159b57259c4f35a4bb6c6be70b506b598f25433`; observación `2026-10-31T18:50:53.070Z`, cero errores de arranque. Artefactos finales: `.cache/s22-08-quality-repeat.log`, `.cache/api-tests/results/report.json` y `.cache/quality/strict-report.json`.

## Frontera de esta entrega

Se conserva el cuerpo de errores HTTP anterior: RFC 9457 se implementa en el ticket 09. La instrumentación actual proporciona correlación local y de publicación inmediata; no constituye un proveedor OpenTelemetry ni propagación W3C distribuida. La persistencia del contexto en outbox, los vínculos entre publicaciones reanudadas días después y la exportación distribuida corresponden al ticket 23. No se agregaron migraciones, endpoints de diagnóstico, dependencias, despliegues ni envíos HCS reales. No hubo cambios de interfaz que requieran repetir la matriz de navegador.

El ticket 08 queda completado y validado localmente el 2026-10-31. Se espera confirmación para implementar el 09.
