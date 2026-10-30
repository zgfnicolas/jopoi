# 21: Aplicar CSP estricta sin romper tema, formularios ni QR

**What to build:** Proteger las páginas frente a scripts y frames no autorizados manteniendo operativa la demo y una decisión explícita sobre render estático o dinámico.

**Blocked by:** 19 · Mostrar el historial inicial sin JavaScript y con status real

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D09, D11, D12; hallazgos AUD-06; historias 43, 44, 53, 56, 57, 85; escenarios S22-15, S22-19, S22-21, S22-22.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] CSP efectiva define script-src restrictivo, object-src, base-uri, form-action y frame-ancestors; nosniff, referrer y HSTS se verifican en su frontera aplicable.
- [ ] Se ensaya Report-Only y luego enforcement; hashes/nonces cubren scripts Next, tema y JSON-LD, no sólo un script aislado.
- [ ] La elección respeta el runtime instalado; se prefiere estática con hashes cuando funcione y cualquier costo dinámico se mide/documenta sin unsafe-inline general.
- [ ] Fuentes, imágenes QR y estilos admitidos son excepciones justificadas; no se abre CORS ni se admite HTML externo.
- [ ] Build de producción/navegador bloquean frame/script no autorizado y conservan tema, formulario, navegación e interacción; validación de hosting permanece explícita para el ticket 31.

