# 08: Investigar fallos desde una referencia pública segura

**What to build:** Permitir que el responsable encuentre el diagnóstico de un error informado por un visitante sin exponer contactos, credenciales o detalles internos.

**Blocked by:** None (can start immediately once the breakdown is approved).

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D05, D13; hallazgos AUD-04, AUD-09; historias 24, 25, 26, 27, 28, 61, 86; escenarios S22-08, S22-09.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [x] Un contexto interno vincula boundary HTTP, servicios y resultado; requestId, trace ID de telemetría y traceId de negocio tienen nombres inequívocos.
- [x] Errores SQL/HCS traducidos conservan causa privada útil; la respuesta pública mantiene mensajes seguros.
- [x] Un logger JSON común incluye campos base, código, duración y ruta plantilla; la redacción se centraliza antes de exportar.
- [x] Un fallo inesperado se registra una vez y un 4xx esperado usa clasificación/muestreo apropiados; stdout funcional de CLI permanece separado.
- [x] Fallos inyectados de SQL/programación se reconstruyen por su referencia y la evidencia exportada no contiene cookies, claves, bytes firmados, parámetros privados ni PII.

## Implementación local

Completado el 2026-10-31. Evidencia, revisión y límites: [S22-08](../../../docs/s22-08-diagnosticos-correlacionados.md). Cuatro pruebas del exportador y 52 HTTP aprobadas junto con la puerta completa y build; cero diagnósticos estrictos. Se documentan el fallo inicial del pipe cerrado y un timeout HTTP no reproducido al repetir aislado y en la segunda puerta. La correlación local incluye trabajo diferido inmediato; propagación W3C, contexto durable y exportación distribuida continúan en 23. El contrato RFC 9457 y el ticket 09 no se implementan en esta entrega.

