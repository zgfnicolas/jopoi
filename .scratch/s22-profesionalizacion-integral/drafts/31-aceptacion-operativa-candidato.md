# 31: Acreditar seguridad, capacidad y recuperación del candidato

**What to build:** Demostrar en el entorno gratuito seleccionado que lo verificado localmente se conserva en el hosting y el proveedor, registrando cualquier bloqueo real.

**Blocked by:** 30 · Cerrar la entrega local con regresión y evidencia reproducibles

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D09, D10, D13, D14, D17, D18, D21; hallazgos AUD-01, AUD-02, AUD-03, AUD-04, AUD-06, AUD-07, AUD-08, AUD-09, AUD-10, AUD-12, AUD-13, AUD-14, AUD-15, AUD-17; historias 1, 2, 15, 16, 20, 24, 25, 27, 38, 42, 43, 44, 45, 46, 47, 48, 50, 52, 60, 61, 62, 64, 66, 67, 69, 70, 71, 72, 76, 78, 79, 80, 82, 83, 84, 85, 86, 88; escenarios S22-01, S22-05, S22-06, S22-08, S22-09, S22-12, S22-14, S22-15, S22-16, S22-17, S22-18, S22-19, S22-24, S22-25, S22-26, S22-27, S22-28, S22-29, S22-30, S22-32.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

**Condiciones externas:** Requiere candidato explícito, acceso al proveedor, responsable/canal de alertas y autorización operativa para despliegue, restore aislado y mensajes testnet. Ninguna dependencia de ticket reemplaza esas condiciones ni autoriza gastos.

## Acceptance criteria

- [ ] Se verifican plan gratuito/integración nativa, región/localidad, límites/pooler, TLS con validación de nombre/certificado, grants mínimos y separación efectiva de ejecución/migración.
- [ ] HTTP/navegador del candidato muestran CSP/headers/cookies/CSRF/cache/status/contratos efectivos; logs/trazas, colector y alertas tienen señal real sin secretos.
- [ ] Carga aprobada contrasta el modelo global con límites efectivos; cron se observa y progreso/retención tienen evidencia del entorno, no sólo respuesta 200.
- [ ] Backups/restore del proveedor se prueban de forma aislada, con RPO/RTO derivados de su oferta real; una carencia permanece bloqueada y no se contrata otro plan.
- [ ] Cuando exista autorización se confirma el recorrido testnet con evidencia real y recuperación de la misma identidad; datos sintéticos/controlados no lo sustituyen.
- [ ] Artefactos se vinculan a revisión, recurso y fecha; permisos, candidato o autorizaciones faltantes se registran como bloqueos externos, sin marcar este ticket aprobado.

