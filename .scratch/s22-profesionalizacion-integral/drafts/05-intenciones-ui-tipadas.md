# 05: Mantener edición y reintentos del panel con intenciones tipadas

**What to build:** Permitir al participante editar, resolver conflictos y reintentar una respuesta incierta con una intención coherente y sin duplicar efectos.

**Blocked by:** 03 · Introducir contratos operativos válidos junto a los actuales

**Status:** implemented — implementación y validación local completas; publicación remota pendiente.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-14, AUD-16; historias 4, 10, 11, 29, 30, 31, 32, 81; escenarios S22-03, S22-10, S22-11.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] El estado de intención se discrimina por acción y requiere los campos que realmente usa; carga, conflicto e incertidumbre son estados explícitos.
- [x] El lote de frontend/componentes/transporte corrige opcionales e índices y elimina la assertion de rol evitable sin reducir validación runtime.
- [x] Una respuesta perdida conserva body y clave originales; un refresh no inventa confirmación ni habilita automáticamente otra escritura.
- [x] Pruebas por navegador cubren edición, conflicto, recarga y reintento con el contrato compatible; no espían funciones privadas.
- [x] La puerta vigente sigue verde y el informe estricto acredita el lote migrado; comentarios relevantes describen invariantes en español rioplatense.

## Evidencia de implementación

[Intenciones, transiciones y verificación local](../../../docs/s22-05-intenciones-panel.md). El controlador usa OperationIntent con metadatos requeridos; distingue actividad de lectura/envío y resolución pendiente, confirmada, incierta o en conflicto. El reintento conserva bytes/clave y una lectura no resuelve por inferencia una escritura incierta.

Se aprobaron 9 escenarios distintos en Chromium desktop en dos tandas: cinco nuevos de edición/conflicto, pérdidas antes/después de guardar, lectura fallida tras confirmación y reintento de publicación; cuatro regresiones de recepción, recarga/cupo, expiración y contacto limitado. Se observan controles y requests públicos, sin inspeccionar estado privado de React. La matriz completa de navegadores/temas no se ejecutó.

`quality:check` aprobado: 4 bloqueos negativos, 7 seguridad, 54 dominio/persistencia, 19 CLI, 2 tokens UI, 49 HTTP y build. Frontend/componentes y servidor/dominio sin diagnósticos estrictos; 59 pendientes quedan en scripts/tests para 06–07. El gate impide reintroducir errores en las áreas migradas.

Se corrigió la interferencia de un interceptor de prueba con la caché durante recarga y se reforzó aislamiento/limpieza de fixtures de seguridad, conservando aserciones y timeouts. Solo se usaron recursos aislados y HCS controlado. Se espera confirmación antes de comenzar el 06.

