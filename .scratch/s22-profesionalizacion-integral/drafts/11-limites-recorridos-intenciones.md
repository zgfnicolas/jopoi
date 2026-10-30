# 11: Limitar intenciones y proteger las lecturas y comandos privados

**What to build:** Permitir que el propietario opere y consulte sin que otra sesión, o cientos de claves distintas, agoten recibos y capacidad compartida.

**Blocked by:** 10 · Acotar la creación diaria de sesiones y solicitudes de demo

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D02, D08; hallazgos AUD-01, AUD-02; historias 5, 6, 7, 9, 10, 11, 12, 13, 42, 62; escenarios S22-01, S22-02, S22-03, S22-04.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Se aplican los techos de S22 a nuevas intenciones por recorrido/globales, lecturas privadas, intentos de mutación y activaciones de publicación; los 100 recibos por recorrido no se evaden con acciones diferentes.
- [ ] Propiedad y vigencia se comprueban antes de resolver un replay; la misma intención no consume otra reserva de negocio, pero sí capacidad de solicitud.
- [ ] Todas las entradas actuales y sus adaptadores pasan por admisión compartida y rechazo temprano; Origin/header custom no se usan como identidad confiable.
- [ ] El rechazo no crea recibo, evento, cambio de versión, cupo de negocio o trabajo externo; caída de admisión no habilita fallback en memoria.
- [ ] HTTP concurrente y navegador muestran 429/503, espera y reintento manual con la misma intención; nuevas entradas futuras deben conservar esta frontera.

