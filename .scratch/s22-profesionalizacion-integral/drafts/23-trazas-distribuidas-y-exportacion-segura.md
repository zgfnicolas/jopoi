# 23: Seguir una acción desde HTTP hasta SQL, HCS y cron

**What to build:** Reconstruir el recorrido técnico completo de una acción, incluso si su publicación ocurre después, con contexto distribuido y un exportador que no afecte al servicio.

**Blocked by:** 08 · Investigar fallos desde una referencia pública segura

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D05, D13, D18; hallazgos AUD-04, AUD-09; historias 24, 25, 26, 27, 28, 61, 66, 67, 68, 83, 86; escenarios S22-08, S22-09, S22-26, S22-29.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Se instrumentan HTTP/SQL/proveedor y trabajo diferido con contexto W3C validado, límites y confianza definidos; baggage externo no impone identidad ni labels.
- [ ] La outbox conserva contexto mínimo para parent/link entre días sin cookies, credenciales, PII o headers libres; cron usa relaciones honestas.
- [ ] Logs y spans comparten referencias inequívocas y campos de servicio/versión/entorno, con redacción antes de exportar.
- [ ] Cola, tamaño, sampling, retención y acceso de telemetría son acotados y compatibles con presupuesto cero; caída del exportador no bloquea operaciones ni crea buffer infinito.
- [ ] Colector de prueba observa la acción completa y la falla asíncrona sin duplicación; migración aditiva del contexto y recuperación histórica no fabrican trazas.

