# 03: Introducir contratos operativos válidos junto a los actuales

**What to build:** Habilitar una migración gradual a estados de operación e intenciones representables con seguridad, manteniendo compatibles los recorridos y recibos existentes.

**Blocked by:** 02 · Preparar verificaciones reproducibles y la expansión del tipado estricto

**Status:** completed — expansión y validación local terminadas el 2026-10-30 por confirmación del usuario para continuar con el 03. La publicación en el tracker sigue pendiente.

**Trazabilidad:** Spec S22; decisiones D01, D06, D16; hallazgos AUD-05, AUD-14, AUD-16; historias 4, 29, 30, 31, 75, 81, 87; escenarios S22-10, S22-11.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] Se introduce el nuevo modelo discriminado y su parsing semántico junto al contrato anterior; no se obliga a migrar todos los consumidores en este cambio.
- [x] Estados previos, asignados y terminales exigen sus datos coherentes; no se inventan pesos, asignaciones o motivos para adaptar datos inválidos.
- [x] Los adaptadores conservan el JSON válido y explican el límite de confianza; los casts de adaptación no sustituyen validación.
- [x] Comandos, lectura y recibos actuales continúan funcionando bajo la puerta vigente; una fixture inválida se rechaza por una frontera pública de reconstrucción.
- [x] Se documenta en español rioplatense la compatibilidad temporal y el orden expandir → migrar consumidores → retirar forma anterior.

## Evidencia de implementación

[Contratos, límites de confianza y validación](../../../docs/s22-03-contratos-operativos.md). OperationSnapshot discrimina los ocho estados; OperationIntent exige los metadatos por kind. La reconstrucción pública del módulo recibe unknown, valida forma y escenario y devuelve un resultado sin fabricar datos. Su adaptador conserva el JSON canónico anterior, sin casts.

`quality:check` aprobado: Prisma, tipos vigentes, lint, 39 pruebas de dominio, 43 HTTP, 2 de bloqueo, 7 seguridad, 19 CLI, 2 tokens UI y build. Cinco archivos nuevos sin diagnósticos estrictos; los 106 pendientes globales permanecen visibles. No se agregaron dependencias ni migraciones.

La fixture inválida se rechaza mediante la función exportada de reconstrucción, no mediante un endpoint nuevo. La migración de reconstrucción SQL, comandos y recibos corresponde al ticket 04; la del panel al 05. CI remoto y aceptación global de S22-10/S22-11 continúan pendientes. Se espera confirmación antes de comenzar el 04.

