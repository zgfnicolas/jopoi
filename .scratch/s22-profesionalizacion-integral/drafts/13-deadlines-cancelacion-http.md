# 13: Rechazar cuerpos lentos y lecturas que exceden su presupuesto

**What to build:** Conservar capacidad y mensajes seguros cuando una lectura, una dependencia o un cliente lento no completan dentro del tiempo permitido.

**Blocked by:** 09 · Entregar errores RFC 9457 comprendidos por toda la interfaz

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D14, D15; hallazgos AUD-17; historias 6, 13, 61, 63, 64, 67; escenarios S22-04, S22-24.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] El cuerpo está acotado por bytes y tiempo aun sin Content-Length fiable; lectores y recursos se cancelan o liberan al terminar/rechazar.
- [ ] SQL, espera de pool y mirror tienen timeout dentro de un deadline total documentado, no sólo límites independientes que se sumen sin control.
- [ ] Contraste remoto completo respeta 10 s y preserva estado histórico ante timeout; no se inventa coincidencia ni rechazo definitivo.
- [ ] La cancelación de una lectura evita trabajo abandonado donde el runtime/driver lo permita; cancelar una mutación no se presenta como rollback ni autoriza otro ID.
- [ ] Pruebas HTTP de cuerpo lento, dependencia caída y desconexión verifican respuesta/estado/capacidad posterior sin introducir sleeps reales extensos.

