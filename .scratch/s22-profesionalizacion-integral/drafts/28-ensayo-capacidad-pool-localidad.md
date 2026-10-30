# 28: Dimensionar admisión y pool con carga de producción

**What to build:** Obtener un techo de admisión respaldado por mediciones y un modelo global de conexiones, para sostener el servicio dentro del presupuesto gratuito.

**Blocked by:** 22 · Recuperar y exportar sólo los datos necesarios; 24 · Medir latencia, saturación y atraso con cardinalidad acotada; 27 · Mantener rápidas las tres rutas con un gate de producción

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D02, D03, D12, D14, D17; hallazgos AUD-01, AUD-02, AUD-11, AUD-12, AUD-15, AUD-17; historias 5, 6, 7, 14, 20, 59, 60, 61, 62, 64, 68, 69, 73, 74, 80, 82, 85; escenarios S22-02, S22-05, S22-06, S22-22, S22-24, S22-26, S22-28.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Build de producción con dataset al menos equivalente a S21 mide estado frío/caliente, concurrencia 8, p95/p99, memoria, espera/rechazos y conexiones; no extrapola Next dev ni promedios.
- [ ] Se contrasta API caliente con p95 ≤750 ms/p99 ≤1.500 ms y saturación bajo el techo de admisión previsto, separando HCS posterior al commit.
- [ ] Modelo distingue instancias×2 más CLI/migración/reserva, clientes de pooler y backend PostgreSQL; incluye parámetros y localidad DB/función.
- [ ] Si los ensayos no sostienen los topes propuestos, se reduce admisión o se mejora capacidad con evidencia y se repite la convergencia; no se aumenta el pool o contrata un plan por intuición.
- [ ] El informe separa capacidad local comprobada de datos reales de región/límites del proveedor pendientes del ticket 31; no los inventa ni declara aceptación global.

