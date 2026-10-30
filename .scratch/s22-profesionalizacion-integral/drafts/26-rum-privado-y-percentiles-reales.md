# 26: Medir la experiencia real sin exportar datos privados

**What to build:** Medir LCP, INP y CLS de visitantes por ruta y dispositivo sin convertir telemetría en una fuga de datos o una nueva vía de agotamiento.

**Blocked by:** 10 · Acotar la creación diaria de sesiones y solicitudes de demo; 19 · Mostrar el historial inicial sin JavaScript y con status real; 23 · Seguir una acción desde HTTP hasta SQL, HCS y cron

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D02, D12, D13; hallazgos AUD-09, AUD-11; historias 27, 51, 57, 58, 68, 83, 84, 85, 86; escenarios S22-01, S22-23, S22-26, S22-32.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Navegador envía sólo métricas/contexto mínimo permitido con versión, ruta plantilla y clase de dispositivo; no URL libre, UUID de recorrido, contactos, body o credenciales.
- [ ] Ingesta y exportación validan esquema, tamaño, rate/capacidad y cardinalidad; telemetría inválida no crea eventos de dominio ni trabajo sin límite.
- [ ] El informe calcula p75 por ruta/cohorte en ventana móvil de 28 días y exige 200 muestras válidas por métrica/cohorte; falta de datos se informa como evidencia insuficiente.
- [ ] Se preservan objetivos LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1; TBT no se reutiliza como INP y no se agrupan rutas para ocultar regresiones.
- [ ] Pruebas de navegador/recepción/exportador observan señal y privacidad con costos/retención acotados; este ticket implementa medición y no finge completar una ventana de campo.

