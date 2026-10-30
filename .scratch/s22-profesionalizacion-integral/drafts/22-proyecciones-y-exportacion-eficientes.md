# 22: Recuperar y exportar sólo los datos necesarios

**What to build:** Mantener replay, lectura y exportación de contactos correctos con menos transferencia y memoria, usando evidencia de consultas para cualquier índice nuevo.

**Blocked by:** 04 · Guardar y recuperar operaciones con invariantes semánticas

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D16, D17; hallazgos AUD-12, AUD-15, AUD-16; historias 31, 32, 61, 73, 74, 75, 86; escenarios S22-03, S22-11, S22-28, S22-30.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Replay y proyecciones eliminan bytes firmados/historial o datos completos innecesarios sin cambiar DTOs o semántica idempotente.
- [ ] Exportación conserva cursor/orden estable, páginas acotadas, escritura esperada, escape seguro y retención privada.
- [ ] El cálculo de bloqueo de hitos se simplifica sólo si aporta claridad; no se reestructura por el O(n²) de cinco hitos sin necesidad.
- [ ] Cualquier índice se justifica con planes y costo de lectura/escritura comparables; SQL sigue parametrizado y no se exponen modelos ORM ni repositorios passthrough.
- [ ] HTTP/CLI demuestran misma salida, aislamiento y ausencia de secretos; evidencia de bytes/memoria/planes acredita el beneficio sin extrapolar a producción.

