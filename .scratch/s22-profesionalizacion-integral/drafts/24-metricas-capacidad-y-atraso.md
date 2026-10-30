# 24: Medir latencia, saturación y atraso con cardinalidad acotada

**What to build:** Permitir al responsable saber si la aplicación responde, qué recurso se satura y cuánto trabajo de publicación o limpieza está atrasado.

**Blocked by:** 12 · Eliminar vencidos con limpieza justa y recuperable; 14 · Publicar y contrastar con capacidad global y recuperación segura; 23 · Seguir una acción desde HTTP hasta SQL, HCS y cron

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D03, D13, D14, D17; hallazgos AUD-02, AUD-09, AUD-12, AUD-17; historias 16, 17, 20, 61, 62, 68, 69, 72, 83; escenarios S22-05, S22-09, S22-26, S22-27, S22-28.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] RED expone rate/errors e histogramas para p50/p95/p99 por vocabularios cerrados; no se informa sólo promedio.
- [ ] Se observa espera/rechazos/conexiones del pool, memoria/event loop y permisos externos sin confundir capacidad por instancia con global.
- [ ] Se miden acciones, replays, conflictos, cuota HCS, incertidumbre, edad de pendientes y limpieza/cron por categoría.
- [ ] Muchos UUID/emails/URLs no multiplican labels; requestId/spanId/traceId de negocio no son dimensiones y todos los eventos pasan por redacción.
- [ ] Carga y colector verifican continuidad ante saturación/falla del exporter y reportes versionados útiles para las alertas y el cálculo de capacidad.

