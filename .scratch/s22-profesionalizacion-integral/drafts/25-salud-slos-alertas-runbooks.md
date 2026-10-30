# 25: Detectar incidentes con salud, objetivos y alertas accionables

**What to build:** Avisar al responsable cuando se degrada el servicio, falta el cron o crece el atraso, indicando qué hacer sin reiniciar por reflejo una instancia sana.

**Blocked by:** 24 · Medir latencia, saturación y atraso con cardinalidad acotada

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D13, D14; hallazgos AUD-02, AUD-04, AUD-09, AUD-17; historias 24, 28, 61, 67, 69, 70, 71, 72, 83, 85; escenarios S22-08, S22-26, S22-27, S22-32.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Liveness no consulta DB/HCS; readiness tiene presupuesto y distingue incapacidad SQL de caída HCS; startup se justifica según uso real del entorno.
- [ ] Se implementan SLIs/SLOs de S22 con disponibilidad 99,5 %, error budget 0,5 %, percentiles, objetivos de publicación/mantenimiento y exclusiones transparentes.
- [ ] Alertas de burn rate 14,4×/6× y señales de bajo tráfico/cron ausente/atraso tienen owner, resolución y runbook; no se mezclan errores esperables con incidentes internos.
- [ ] Vistas de error muestran referencia segura investigable; 403/429/503 y Retry-After responden al estado real.
- [ ] Entrega a un destino de prueba autorizado y una caída simulada verifican señal y recuperación; destino real/configuración del candidato se acredita externamente, no por un archivo declarativo.

