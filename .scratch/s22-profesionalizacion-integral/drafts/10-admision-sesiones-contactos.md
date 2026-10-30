# 10: Acotar la creación diaria de sesiones y solicitudes de demo

**What to build:** Aceptar nuevas sesiones y contactos reales sólo dentro de una capacidad diaria compartida y explicar el rechazo sin perder los datos del visitante.

**Blocked by:** 09 · Entregar errores RFC 9457 comprendidos por toda la interfaz

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D02, D03; hallazgos AUD-01, AUD-02; historias 3, 5, 6, 7, 8, 11, 13, 15, 50, 85; escenarios S22-01, S22-02, S22-04, S22-05.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Se conservan ventanas actuales y se agregan techos iniciales globales de 100 sesiones nuevas/día y 100 contactos nuevos/día, sin relajar reglas previas.
- [ ] La reserva duradera y creación/replay son atómicas entre dos instancias; repetir una creación confirmada no consume otro cupo de creación.
- [ ] La política distingue solicitudes de reservas nuevas, fija UTC y falla cerrada ante contador/configuración indisponible.
- [ ] Identidad de visitante usa HMAC y política explícita para NAT/IPv6/ingreso confiable, sin IP cruda en persistencia o logs.
- [ ] Al alcanzar el límite, HTTP devuelve 429/Problem Details/Retry-After sin escritura parcial y el formulario conserva sus campos e intención.

