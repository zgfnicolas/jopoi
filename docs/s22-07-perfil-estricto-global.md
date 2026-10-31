# S22-07 · Perfil estricto global obligatorio

Fecha: 2026-10-31. Alcance: ticket 07, D06/D19 y comprobaciones locales de S22-10/S22-31. Cierra la migración mecánica de los tickets 02–06.

## Configuración y puerta

`tsconfig.json` exige `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. La variante API hereda las tres opciones y conserva sus alias del arnés. `tsconfig.strict.json` conserva su comando compatible como variante no incremental de la misma configuración, sin duplicar ni sobrescribir las opciones estrictas. Se mantienen íntegros los include/exclude de los tres perfiles; la configuración principal sigue incluyendo código propio, scripts, pruebas y configuraciones raíz.

La puerta exige además `typecheck:api`. `typecheck:report` sigue produciendo JSON, texto y Markdown, pero ahora **todo diagnóstico o fallo del compilador bloquea**, cualquiera sea la carpeta. Se elimina la lista de áreas migradas y la tolerancia temporal. El SHA-256 del informe incluye las tres configuraciones. El workflow existente ejecuta la misma puerta y publica su informe obligatorio; su ejecución remota y la protección de rama siguen pendientes de configuración/publicación.

Los controles negativos invocan la puerta real con archivos nuevos sin trackear. Comprueban errores comunes de tipos, índices inciertos en servidor/scripts/configuración raíz, propiedades opcionales explícitamente undefined en frontend/tests y una infracción de lint. La comprobación de configuración efectiva usa `tsc --showConfig` para las tres variantes y contrasta que el perfil principal incluya ejemplos reales de todas las áreas propias. Otra prueba invoca directamente el informe con una regresión en scripts: debe fallar y conservar el diagnóstico, y después de retirar la fixture debe volver a aprobar y restituir el informe real.

## Retirada de compatibilidad mecánica

Se elimina `toLegacyOperationData`: no tenía consumidores de producción y era una identidad usada solamente por pruebas de la expansión del ticket 03. Esas pruebas ahora contrastan directamente el resultado reconstruido, su validación JSON y sus bytes canónicos con los vectores anteriores.

Se conservan `OperationData` y `operationDataSchema`: siguen siendo el contrato de transporte/recibo y el límite de entrada del motor antes de la reconstrucción semántica. No son aliases huérfanos de la migración. `OperationSnapshot` permanece como resultado discriminado y validado del dominio. No se retiran adaptadores HTTP, validaciones runtime, campos, valores null, payloads históricos ni hashes.

## Assertions residuales revisadas

No se agregan casts de escape, assertions de no nulidad, supresiones ni exclusiones. Las assertions existentes cumplen funciones concretas y esta activación del compilador no las convierte en validación runtime:

- `as const` conserva discriminantes y selecciones literales en catálogos, Prisma y fixtures; no convierte un dato externo a un tipo arbitrario.
- `sessions/service.ts` serializa el escenario local construido por el dominio antes de escribirlo como `Prisma.InputJsonObject`. `database/index.ts` delimita el campo del singleton de desarrollo en `globalThis`; no afirma la validez de una entrada HTTP.
- `database/connection-policy.ts` consume la conexión construida por su propio lector. Las assertions del coordinador HCS dependen de guardas de preparación y del estado RESERVED; la proyección de eventos depende de parse exitoso, coherencia semántica e integridad antes de exponer el payload.
- Los accesos tipados al catálogo de mensajes en componentes operan sobre códigos acotados por los transportes y su comprobación de catálogo. La validación runtime de esos transportes permanece activa.
- Los clientes genéricos HTTP de pruebas expresan la respuesta esperada para hacer aserciones sobre ella; no se usan como validadores del servidor. El ledger, reloj, certificados y eventos pertenecen al arnés controlado. Las assertions DOM/QR/cookies de E2E describen elementos o resultados concretos comprobados por el escenario.
- La aceptación live conserva la comprobación explícita de identificador, red, demo, eventos, orden y evidencia de mirror antes de aceptar un hito. Ese flujo no se ejecuta ni se acredita en esta entrega.

## Reproducción y alcance de evidencia

Ejecutá `npm run quality:check` con Node 24 y los binarios PostgreSQL preparados. La puerta sella el entorno, usa PostgreSQL efímero y ledger controlado, y se detiene ante el primer fallo. `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:strict` y `npm run typecheck:report -- --snapshot` permiten revisar los perfiles por separado.

No se introducen dependencias, migraciones SQL ni cambios de comportamiento de negocio o UI. No se envía HCS real ni se conecta un proveedor o la base habitual. La evidencia local no acredita CI remoto ni aceptación global de S22.

### Fixture de auditoría

La primera puerta alcanzó nuevamente el timeout de 15 segundos al invocar `npm run security:audit` en el registro sintético. Se identificó y detuvo únicamente el proceso de esa fixture retenida. El registro y los casos moderate/high/critical/indisponible no cambian: ahora se leen y verifican los argumentos del comando configurado y se invoca directamente el mismo ejecutable npm con `audit`, evitando la cadena `npm run → cmd.exe → npm` y sus procesos descendientes al abortar. Un comando distinto de npm audit o con sintaxis de shell falla explícitamente en la fixture. Se conservan los límites de 15/20 segundos y los resultados exigidos; las siete pruebas de seguridad aprobaron después del cambio. El log de la primera puerta queda en `.cache/s22-07-quality-initial.log`.

### Cierre local

`quality:check` aprobado con **9 controles de calidad, 7 pruebas de seguridad, 54 de dominio/persistencia, 23 CLI, 2 de tokens, 49 HTTP y build de producción**. Incluye compilación principal y API con las tres opciones estrictas obligatorias. La regresión HTTP tardó 916,84 segundos en este equipo; no es una medición del rendimiento del producto.

Revisión base: `57737d95bac37c392930cd748a5d81b71b8b4e62`, con cambios locales todavía sin commit. Huella de fuentes del reporte HTTP: `51d0c560f39aa999183af0fb82774b5d821bfbef9154be8d3e0e69e6efbcb7a7`; observación `2026-10-31T16:42:02.067Z`. Artefactos: `.cache/s22-07-quality.log`, `.cache/api-tests/results/report.json` y `.cache/quality/strict-report.json`. El snapshot legible está en [s22-02-diagnosticos-estrictos.md](s22-02-diagnosticos-estrictos.md).

No se repitió la matriz E2E de navegadores ni el laboratorio SEO; no cambiaron sus componentes, contratos ni flujos. No hay despliegue ni evidencia de servicios externos. El ticket 07 queda completado localmente y se espera confirmación para implementar el 08.
