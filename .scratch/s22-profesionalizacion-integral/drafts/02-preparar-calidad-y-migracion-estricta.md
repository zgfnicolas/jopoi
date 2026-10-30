# 02: Preparar verificaciones reproducibles y la expansión del tipado estricto

**What to build:** Permitir que cada cambio se verifique de forma reproducible y que la migración de tipado avance por lotes sin romper el desarrollo entre entregas.

**Blocked by:** None (can start immediately once the breakdown is approved).

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-08, AUD-16; historias 29, 31, 32, 33, 34, 35, 81, 87; escenarios S22-10, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Existe una puerta reproducible de tipos actuales, lint compatible y regresión disponible; CLI y tokens UI se invocan explícitamente y no se presentan como parte implícita de npm test.
- [ ] Se agrega el perfil con las tres opciones estrictas junto al actual y un informe identificable de diagnósticos pendientes por área; la compilación vigente sigue aprobada.
- [ ] El perfil completo es diagnóstico temporal, no aceptación final ni una exclusión permanente de código; el ticket 07 lo convierte en obligatorio y retira la transición.
- [ ] Se elige un único linter principal y se justifican las reglas; no se debilita strict, se ocultan carpetas o se agregan casts/supresiones para reducir diagnósticos.
- [ ] Una infracción deliberada en un control ya exigido bloquea el gate; los jobs de PR no confiable no reciben secretos ni migran bases reales.

