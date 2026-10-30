# 18: Consultar trazabilidad pública versionada y condicional

**What to build:** Permitir que consumidores públicos consulten trazabilidad con una versión explícita y validadores correctos, preservando los enlaces existentes y la vigencia del recurso.

**Blocked by:** 09 · Entregar errores RFC 9457 comprendidos por toda la interfaz

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D07, D08, D11; hallazgos AUD-07, AUD-10; historias 36, 38, 41, 42, 51, 52, 54, 86; escenarios S22-01, S22-12, S22-14, S22-19.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] La versión pública v1 y sus subrecursos están documentados en OpenAPI; las rutas anteriores son adaptadores con las mismas reglas y sin lógica duplicada.
- [ ] ETag representa toda la respuesta pertinente; If-None-Match devuelve 304 sin body sólo después de comprobar existencia, vigencia y admisión.
- [ ] Cambios de cuota/publicación no reutilizan un validator operativo erróneo; privados mantienen private,no-store/Vary y públicos no-store según S22.
- [ ] Deprecation y enlace de migración son explícitos; Sunset sólo se emite con fecha acordada y evidencia de consumidores, y no se elimina la ruta antigua.
- [ ] Respuestas y evidencias excluyen propietario/credencial/contactos; navegación y GET no crean sesión, cambios de dominio ni envíos HCS; observedAt distingue lectura actual.

