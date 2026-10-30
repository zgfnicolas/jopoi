# 02: Preparar verificaciones reproducibles y la expansión del tipado estricto

**What to build:** Permitir que cada cambio se verifique de forma reproducible y que la migración de tipado avance por lotes sin romper el desarrollo entre entregas.

**Blocked by:** None (can start immediately once the breakdown is approved).

**Status:** completed — implementación y validación local terminadas el 2026-10-30, por confirmación del usuario para continuar con el 02. La publicación en el tracker permanece pendiente.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-08, AUD-16; historias 29, 31, 32, 33, 34, 35, 81, 87; escenarios S22-10, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] Existe una puerta reproducible de tipos actuales, lint compatible y regresión disponible; CLI y tokens UI se invocan explícitamente y no se presentan como parte implícita de npm test.
- [x] Se agrega el perfil con las tres opciones estrictas junto al actual y un informe identificable de diagnósticos pendientes por área; la compilación vigente sigue aprobada.
- [x] El perfil completo es diagnóstico temporal, no aceptación final ni una exclusión permanente de código; el ticket 07 lo convierte en obligatorio y retira la transición.
- [x] Se elige un único linter principal y se justifican las reglas; no se debilita strict, se ocultan carpetas o se agregan casts/supresiones para reducir diagnósticos.
- [x] Una infracción deliberada en un control ya exigido bloquea el gate; los jobs de PR no confiable no reciben secretos ni migran bases reales.

## Evidencia de implementación

[Puerta, decisiones y validación](../../../docs/s22-02-calidad-reproducible.md). Biome 2.6.4 es el único linter principal. `quality:check` exige Prisma, tipos vigentes, lint, pruebas de bloqueo, seguridad, CLI, tokens UI, API y build. Instalación limpia y puerta completa aprobadas; 2 pruebas de bloqueo, 7 de seguridad, 19 CLI, 2 tokens y 43 HTTP aprobadas. Auditoría completa sin vulnerabilidades. Tres regresiones seleccionadas de Chromium verificadas, con corrección de un selector NOSCRIPT del arnés.

[Perfil completo diagnóstico](../../../docs/s22-02-diagnosticos-estrictos.md): 106 pendientes en 40 archivos, visibles por área. No se acredita aceptación final de S22-10 ni cierre global de D19. El ticket 07 debe activar las tres opciones en todas las variantes y retirar la tolerancia.

Workflow creado para PR/main sin secretos, permisos de escritura, despliegues ni migraciones de bases habituales. Sólo se migran recursos descartables del arnés. La ejecución remota y la protección de rama requieren publicar/configurar GitHub. Se espera confirmación antes del ticket 03.

