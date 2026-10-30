# 17: Editar la operación con If-Match e Idempotency-Key

**What to build:** Aplicar una edición del recorrido una sola vez y rechazar versiones viejas con un contrato HTTP estándar comprendido por el panel.

**Blocked by:** 04 · Guardar y recuperar operaciones con invariantes semánticas; 11 · Limitar intenciones y proteger las lecturas y comandos privados; 15 · Proteger la sesión HTTPS y sus mutaciones con CSRF

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D07, D08; hallazgos AUD-07, AUD-14; historias 10, 11, 36, 39, 40, 42, 55, 75; escenarios S22-01, S22-03, S22-12, S22-13, S22-14.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] GET/PATCH del subrecurso operativo tiene representación y media type definidos, sin mezclar cuotas/publicación; PATCH permite sólo cambios de dominio válidos.
- [ ] ETag fuerte representa ese recurso y la condición se aplica atómicamente tras autorizar: falta If-Match da 428 y mismatch da 412 sin efectos.
- [ ] Header Idempotency-Key se vincula al recibo existente: discrepancia con UUID de cuerpo da 400 y contenido distinto con la misma clave da 409.
- [ ] Un replay autorizado se resuelve antes de reaplicar la precondición causada por su propia ejecución; distingue resultado histórico/actual y no vuelve a escribir.
- [ ] El panel usa la nueva operación y ETag, maneja conflicto/incertidumbre y refresh; comandos anteriores siguen adaptados sin otra lógica ni bypass de admisión/CSRF, con contrato y pruebas concurrentes.

