# 04: Guardar y recuperar operaciones con invariantes semánticas

**What to build:** Asegurar que una operación confirmada, su historial y su recuperación desde SQL correspondan siempre a un estado válido del dominio.

**Blocked by:** 03 · Introducir contratos operativos válidos junto a los actuales

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D16, D18; hallazgos AUD-05, AUD-14; historias 4, 29, 30, 31, 75, 76, 77, 86; escenarios S22-10, S22-11, S22-29.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Comandos, reconstrucción desde SQL, eventos y recibos migran a los contratos nuevos preservando los tres caminos: conformidad, rechazo e incidencia.
- [ ] Estados terminales incompletos y JSON corrupto se rechazan sin producir respuesta exitosa ni modificar evidencia histórica.
- [ ] Los CHECK o restricciones necesarios se agregan mediante expansión compatible y validación de datos previa; no se editan migraciones aplicadas.
- [ ] Estado, versión, recibo, evento y pendiente siguen atómicos; HTTP y carreras de rollback lo demuestran sin red dentro de SQL.
- [ ] El lote de servidor/dominio queda libre de sus diagnósticos estrictos, sin any ni assertions introducidos para silenciar errores; clientes previos siguen compatibles.

