# 32: Validar resultados de campo y cerrar los seis DoD

**What to build:** Permitir que el responsable acepte la profesionalización sólo cuando todas las brechas aplicables tengan evidencia local, operativa y real suficiente.

**Blocked by:** 31 · Acreditar seguridad, capacidad y recuperación del candidato

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D12, D13, D14, D20, D21; hallazgos AUD-01, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06, AUD-07, AUD-08, AUD-09, AUD-10, AUD-11, AUD-12, AUD-13, AUD-14, AUD-15, AUD-16, AUD-17; historias 1, 2, 15, 16, 20, 22, 25, 27, 28, 58, 59, 68, 69, 70, 72, 79, 80, 83, 84, 85, 87, 88; escenarios S22-23, S22-26, S22-27, S22-28, S22-30, S22-32.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

**Condiciones externas:** Requiere ventana móvil de 28 días y al menos 200 muestras válidas por métrica/cohorte para CWV; objetivos de disponibilidad/publicación necesitan su propia evidencia operativa. Tiempo transcurrido no sustituye volumen o aprobación.

## Acceptance criteria

- [ ] RUM calcula p75 por ruta/cohorte con volumen/ventana suficientes: LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1; no mezcla rutas ni usa TBT como sustituto.
- [ ] Disponibilidad 99,5 %, percentiles, publicación elegible 99 %/36 h, cron y eliminación física se evalúan con exclusiones transparentes y datos reales.
- [ ] Se revisan error budgets, incidentes, costo/cardinalidad/retención de telemetría, owners y runbooks efectivos.
- [ ] Los 17 hallazgos y seis DoD tienen evidencia de revisión compatible; una excepción es explícita, justificada y temporal, y no reemplaza los avisos obligatorios que debían remediarse.
- [ ] Datos insuficientes o control externo ausente mantienen aceptación parcial/pendiente; no se afirma un sistema profesionalmente aceptado por omisión ni se cierra/modifica una issue padre automáticamente.

