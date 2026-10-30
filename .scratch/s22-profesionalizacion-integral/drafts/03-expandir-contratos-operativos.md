# 03: Introducir contratos operativos válidos junto a los actuales

**What to build:** Habilitar una migración gradual a estados de operación e intenciones representables con seguridad, manteniendo compatibles los recorridos y recibos existentes.

**Blocked by:** 02 · Preparar verificaciones reproducibles y la expansión del tipado estricto

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D06, D16; hallazgos AUD-05, AUD-14, AUD-16; historias 4, 29, 30, 31, 75, 81, 87; escenarios S22-10, S22-11.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Se introduce el nuevo modelo discriminado y su parsing semántico junto al contrato anterior; no se obliga a migrar todos los consumidores en este cambio.
- [ ] Estados previos, asignados y terminales exigen sus datos coherentes; no se inventan pesos, asignaciones o motivos para adaptar datos inválidos.
- [ ] Los adaptadores conservan el JSON válido y explican el límite de confianza; los casts de adaptación no sustituyen validación.
- [ ] Comandos, lectura y recibos actuales continúan funcionando bajo la puerta vigente; una fixture inválida se rechaza por una frontera pública de reconstrucción.
- [ ] Se documenta en español rioplatense la compatibilidad temporal y el orden expandir → migrar consumidores → retirar forma anterior.

