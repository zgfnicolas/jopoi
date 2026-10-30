# 12: Eliminar vencidos con limpieza justa y recuperable

**What to build:** Eliminar datos vencidos de forma sostenible y recuperar atraso sin bloquear toda la operación ni presentar una limpieza parcial como completa.

**Blocked by:** 11 · Limitar intenciones y proteger las lecturas y comandos privados

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D03, D14, D16; hallazgos AUD-02, AUD-17; historias 14, 15, 16, 17, 18, 19, 20, 72, 75, 85; escenarios S22-05, S22-06, S22-27.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Cron/CLI repiten tandas pequeñas y deterministas con progreso justo por categoría, dentro de 45 s cooperativos y reserva de cierre de la ejecución.
- [ ] El cálculo de lote contempla hijos acotados del recorrido; leases, triggers e integridad siguen protegidos y una caída permite reanudar sin reescribir evidencia.
- [ ] A carga diaria admitida el atraso no crece; siete días sin cron vuelven a un atraso de como máximo un día tras tres ejecuciones exitosas, o se reduce la admisión y se documenta el límite.
- [ ] Se observa eliminación física dentro de 36 h del vencimiento en operación normal, separada de denegación lógica inmediata y de fallos del programador.
- [ ] CLI y salida de mantenimiento exponen conteos, antigüedad del vencido más viejo, categoría sin progreso y fechas parcial/completa sin PII; casos multijornada usan reloj controlado.

