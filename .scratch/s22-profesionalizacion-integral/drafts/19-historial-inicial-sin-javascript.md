# 19: Mostrar el historial inicial sin JavaScript y con status real

**What to build:** Permitir abrir una trazabilidad y leer su historial inmediatamente, aun sin JavaScript, recibiendo un status HTTP real si no está disponible.

**Blocked by:** 18 · Consultar trazabilidad pública versionada y condicional

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D09, D11; hallazgos AUD-06, AUD-10; historias 51, 52, 53, 54, 56, 57; escenarios S22-01, S22-19, S22-21.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] El render inicial consulta el servicio compartido y no la propia API; aplica validación, admisión y presupuesto también a SSR/prefetch.
- [ ] UUID inválido/inexistente, vencimiento y fallo de servicio se resuelven antes del shell con 404/410/503 reales y contenido seguro.
- [ ] Si la página del runtime no expresa un status, se usa una frontera HTTP previa compatible; un shell 200 no se presenta como error HTTP real.
- [ ] Historial, observación y enlaces textuales son útiles sin JS; contraste y QR quedan como interacción progresiva sin duplicar lectura inicial.
- [ ] Boundaries coherentes reservan geometría y no filtran credenciales ni provocan hydration mismatch; HTTP/navegador verifican que consultar no consume cupo ni publica.

