# 01: Resolver los avisos de seguridad del SDK de Hedera

**What to build:** Mantener guardado, publicación y contraste del recorrido con una cadena de dependencias reproducible libre de los dos avisos conocidos de ws, sin perder compatibilidad ni degradar el SDK a ciegas.

**Blocked by:** None (can start immediately once the breakdown is approved).

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D04, D19; hallazgos AUD-03; historias 21, 22, 23, 85; escenarios S22-07, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] La resolución efectiva de ws queda fuera de ambos rangos afectados; se documentan SDK/ethers/ws, advisories y compatibilidad de la solución elegida.
- [ ] Se usa actualización compatible o un override estrecho revisado; no se aplica audit fix --force ni downgrade automático.
- [ ] Instalación limpia desde lockfile, regresión de publicación/contraste y análisis de producción demuestran el cambio con ledger controlado.
- [ ] Se registra alcanzabilidad y política de excepciones con owner/vencimiento; para estos dos avisos se exige remediar la versión.
- [ ] El análisis continuo detecta un aviso alto/crítico sin resolver y no instala ni publica actualizaciones automáticamente.

