# 07: Activar el perfil estricto completo y retirar compatibilidad de tipos

**What to build:** Impedir que se integre código que deje estados o accesos inciertos después de completar la migración de todos los consumidores.

**Blocked by:** 04 · Guardar y recuperar operaciones con invariantes semánticas; 05 · Mantener edición y reintentos del panel con intenciones tipadas; 06 · Validar CLI, configuración y arneses con tipos estrictos

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-08, AUD-16; historias 29, 30, 31, 32, 33, 34, 35, 81; escenarios S22-10, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Las tres opciones quedan activas en la configuración principal y todas sus variantes; código propio, scripts, configuración y tests dan cero diagnósticos.
- [ ] Se retiran tipos y adaptadores sólo de la migración mecánica que ya no tengan consumidores; no se eliminan adaptadores HTTP de compatibilidad pública.
- [ ] Se elimina la tolerancia diagnóstica temporal; una regresión de tipos o lint bloquea integración.
- [ ] No se reducen carpetas comprobadas, reglas o validación runtime para pasar el gate; las assertions residuales tienen justificación concreta.
- [ ] Build y suites requeridas aprueban con el mismo perfil y una revisión identificable.

