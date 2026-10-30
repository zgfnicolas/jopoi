# 09: Entregar errores RFC 9457 comprendidos por toda la interfaz

**What to build:** Mostrar errores uniformes e investigables en lectura, operación y solicitud de demo, con un contrato HTTP verificable y sin perder intenciones al cambiar el formato.

**Blocked by:** 08 · Investigar fallos desde una referencia pública segura

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D07, D19; hallazgos AUD-07, AUD-08; historias 11, 13, 24, 36, 37, 42; escenarios S22-04, S22-08, S22-12, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Servidor y tres transportes admiten application/problem+json con type/title/status/detail seguros, code y referencias; errores de campo no reproducen valores recibidos.
- [ ] La transición conserva compatibilidad entre versiones desplegadas; una respuesta desconocida no se toma por éxito ni crea otra intención.
- [ ] Se introduce el documento OpenAPI 3.2 válido con inventario actual, seguridad, schemas, errores y headers; futuras entregas lo extienden al cambiar contratos.
- [ ] 429 y 503 admiten Retry-After conforme al plazo conocido; las vistas preservan datos y ofrecen recuperación manual.
- [ ] Pruebas HTTP/cliente y contraste del contrato demuestran fallos esperables e inesperados, sin filtrar stack, SQL o topología.

