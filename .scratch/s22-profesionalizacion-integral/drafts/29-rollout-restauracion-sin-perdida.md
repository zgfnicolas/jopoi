# 29: Ensayar migraciones y restauración sin alterar evidencia

**What to build:** Actualizar y recuperar la aplicación de manera reanudable sin perder operaciones, romper consumidores previos ni confundir restauración SQL con reversión de HCS.

**Blocked by:** 04 · Guardar y recuperar operaciones con invariantes semánticas; 12 · Eliminar vencidos con limpieza justa y recuperable; 14 · Publicar y contrastar con capacidad global y recuperación segura; 16 · Cerrar sesiones y hacer efectivo el vencimiento por inactividad; 23 · Seguir una acción desde HTTP hasta SQL, HCS y cron

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D03, D10, D13, D16, D18, D19; hallazgos AUD-02, AUD-09, AUD-13, AUD-14, AUD-15, AUD-17; historias 19, 20, 46, 47, 66, 75, 76, 77, 78, 79, 80, 82, 83, 86; escenarios S22-06, S22-11, S22-16, S22-17, S22-25, S22-29, S22-30, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Un runner único aplica migrate deploy con conexión administrativa separada; no migra durante build ni usa db push/migrate dev en producción.
- [ ] Expand/backfill en lotes/switch tiene progreso, lock timeout y recuperación; se ensaya coexistencia de aplicación anterior/nueva con cambios de sesión, admisión, capacidad y contexto.
- [ ] Un estado histórico inválido bloquea o se pone en cuarentena documentada; no se fabrican datos, se modifican digests ni se editan migraciones aplicadas.
- [ ] Restore aislado y reinicio comparan estado, payload, digest, recibos e identidades externas; recuperación reconcilia el mismo envío incierto.
- [ ] Rollback de código conserva columnas/compatibilidad necesarias; contract destructivo se difiere fuera de esta entrega. RPO/RTO y capacidades remotas quedan para evidencia real, sin promesas inventadas.

