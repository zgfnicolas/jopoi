# 20: Hacer visible la antigüedad y actualizar antes de editar

**What to build:** Ayudar al participante y al lector a distinguir la última lectura de un estado actual y evitar escribir desde una vista demasiado antigua.

**Blocked by:** 17 · Editar la operación con If-Match e Idempotency-Key; 19 · Mostrar el historial inicial sin JavaScript y con status real

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D08, D11; hallazgos AUD-10; historias 11, 49, 53, 54, 55, 57; escenarios S22-13, S22-19, S22-20, S22-21.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Las lecturas exponen observedAt y la UI comunica antigüedad sin prometer seguimiento en vivo.
- [ ] Desde 60 s el estado privado se marca antiguo y exige refresh antes de otra escritura, conservando borrador, intención pendiente y precondición server-side.
- [ ] Una observación de contraste de más de cinco minutos se identifica como anterior sin borrar confirmación histórica ni fingir verificación nueva.
- [ ] Expiración, regreso de historial/pestaña y respuestas tardías retiran o actualizan la vista correcta; no hay polling ni reintentos automáticos.
- [ ] Navegador con reloj controlado y red lenta verifica geometría estable, navegación y mensajes en móvil/escritorio y ambos temas.

