# 05: Mantener edición y reintentos del panel con intenciones tipadas

**What to build:** Permitir al participante editar, resolver conflictos y reintentar una respuesta incierta con una intención coherente y sin duplicar efectos.

**Blocked by:** 03 · Introducir contratos operativos válidos junto a los actuales

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-14, AUD-16; historias 4, 10, 11, 29, 30, 31, 32, 81; escenarios S22-03, S22-10, S22-11.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] El estado de intención se discrimina por acción y requiere los campos que realmente usa; carga, conflicto e incertidumbre son estados explícitos.
- [ ] El lote de frontend/componentes/transporte corrige opcionales e índices y elimina la assertion de rol evitable sin reducir validación runtime.
- [ ] Una respuesta perdida conserva body y clave originales; un refresh no inventa confirmación ni habilita automáticamente otra escritura.
- [ ] Pruebas por navegador cubren edición, conflicto, recarga y reintento con el contrato compatible; no espían funciones privadas.
- [ ] La puerta vigente sigue verde y el informe estricto acredita el lote migrado; comentarios relevantes describen invariantes en español rioplatense.

