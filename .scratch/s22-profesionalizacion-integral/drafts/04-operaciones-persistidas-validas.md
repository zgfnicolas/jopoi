# 04: Guardar y recuperar operaciones con invariantes semánticas

**What to build:** Asegurar que una operación confirmada, su historial y su recuperación desde SQL correspondan siempre a un estado válido del dominio.

**Blocked by:** 03 · Introducir contratos operativos válidos junto a los actuales

**Status:** implemented — implementación y validación local completas; publicación remota pendiente.

**Trazabilidad:** Spec S22; decisiones D06, D16, D18; hallazgos AUD-05, AUD-14; historias 4, 29, 30, 31, 75, 76, 77, 86; escenarios S22-10, S22-11, S22-29.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] Comandos, reconstrucción desde SQL, eventos y recibos migran a los contratos nuevos preservando los tres caminos: conformidad, rechazo e incidencia.
- [x] Estados terminales incompletos y JSON corrupto se rechazan sin producir respuesta exitosa ni modificar evidencia histórica.
- [x] Los CHECK o restricciones necesarios se agregan mediante expansión compatible y validación de datos previa; no se editan migraciones aplicadas.
- [x] Estado, versión, recibo, evento y pendiente siguen atómicos; HTTP y carreras de rollback lo demuestran sin red dentro de SQL.
- [x] El lote de servidor/dominio queda libre de sus diagnósticos estrictos, sin any ni assertions introducidos para silenciar errores; clientes previos siguen compatibles.

## Evidencia de implementación

[Persistencia, auditoría previa y expansión SQL](../../../docs/s22-04-persistencia-operativa.md). Se validan reconstrucción SQL, replay, eventos y reintentos con el contrato semántico; no se regenera evidencia corrupta. La traza conserva el diagnóstico MISMATCH por evento, sin publicar su payload como confiable.

`quality:check` aprobado con 54 pruebas de dominio/persistencia, 49 HTTP, 7 seguridad, 19 CLI, 2 tokens UI y build. Los 3 bloqueos negativos de calidad también pasan. Servidor/dominio sin diagnósticos estrictos; 80 pendientes globales quedan visibles hasta 05–07.

Las migraciones nuevas separan expansión NOT VALID y VALIDATE; se prueba historia inválida sin reescritura y se conserva historia válida completa de conformidad, rechazo e incidencia. Solo se migraron bases aisladas de pruebas y se utilizó HCS controlado. Se espera confirmación antes de comenzar el 05.

