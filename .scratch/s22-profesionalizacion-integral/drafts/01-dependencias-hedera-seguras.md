# 01: Resolver los avisos de seguridad del SDK de Hedera

**What to build:** Mantener guardado, publicación y contraste del recorrido con una cadena de dependencias reproducible libre de los dos avisos conocidos de ws, sin perder compatibilidad ni degradar el SDK a ciegas.

**Blocked by:** None (can start immediately once the breakdown is approved).

**Status:** completed — implementación y validación local terminadas el 2026-10-30 por autorización posterior del usuario. La publicación en el tracker sigue pendiente y es independiente de este resultado.

**Trazabilidad:** Spec S22; decisiones D04, D19; hallazgos AUD-03; historias 21, 22, 23, 85; escenarios S22-07, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] La resolución efectiva de ws queda fuera de ambos rangos afectados; se documentan SDK/ethers/ws, advisories y compatibilidad de la solución elegida.
- [x] Se usa actualización compatible o un override estrecho revisado; no se aplica audit fix --force ni downgrade automático.
- [x] Instalación limpia desde lockfile, regresión de publicación/contraste y análisis de producción demuestran el cambio con ledger controlado.
- [x] Se registra alcanzabilidad y política de excepciones con owner/vencimiento; para estos dos avisos se exige remediar la versión.
- [x] El análisis continuo detecta un aviso alto/crítico sin resolver y no instala ni publica actualizaciones automáticamente.

## Evidencia de implementación

[Decisión, alcanzabilidad, política y validación](../../../docs/s22-01-dependencias-seguras.md). SDK 2.90.1 y ethers 6.16.0 conservados; ws transitivo 8.21.0 mediante override estrecho. Instalación limpia correcta, auditorías de producción/completa sin vulnerabilidades, 7/7 pruebas de seguridad y 43/43 HTTP aprobadas, generación Prisma y typecheck correctos.

Workflow de dependencias creado y gate probado localmente contra avisos sintéticos altos/críticos y registro indisponible. La ejecución en GitHub y exigir el check mediante protección de rama quedan pendientes de publicar/configurar el repositorio remoto. No se enviaron mensajes HCS reales. Se espera confirmación del usuario antes de implementar el ticket 02.

