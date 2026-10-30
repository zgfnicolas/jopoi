# 15: Proteger la sesión HTTPS y sus mutaciones con CSRF

**What to build:** Recuperar una sesión y ejecutar acciones legítimas con una cookie restringida al host y un token CSRF vinculado, sin exponer la credencial de autenticación.

**Blocked by:** 09 · Entregar errores RFC 9457 comprendidos por toda la interfaz

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D07, D10; hallazgos AUD-13; historias 3, 42, 45, 48, 49, 50, 86; escenarios S22-12, S22-16, S22-18.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] HTTPS usa __Host-, Secure, HttpOnly, Lax, Path=/ y sin Domain; HTTP local tiene política explícita y la migración de cookie no amplía propiedad/vencimiento.
- [ ] Coexistencia de credenciales ambigua exige sesión inequívoca; cookie antigua se retira según ventana documentada.
- [ ] Una lectura same-origin entrega token CSRF con no-store sin crear sesión ni escribir por GET; el token no es la credencial de sesión y no va a storage/logs.
- [ ] Todos los transportes de mutación envían X-CSRF-Token; origen, metadata y fallback estricto se validan y bootstrap anónimo sigue protegido.
- [ ] Navegador HTTPS y API rechazan token ausente/ajeno, Origin o metadata cross-site sin efectos; formulario y operación conservan su experiencia válida y OpenAPI refleja el cambio.

