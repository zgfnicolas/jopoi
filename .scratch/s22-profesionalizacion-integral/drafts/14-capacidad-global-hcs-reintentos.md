# 14: Publicar y contrastar con capacidad global y recuperación segura

**What to build:** Procesar publicaciones y contrastes sin saturar dependencias ni duplicar transacciones, incluso con varias instancias, caída o resultados inciertos.

**Blocked by:** 11 · Limitar intenciones y proteger las lecturas y comandos privados; 13 · Rechazar cuerpos lentos y lecturas que exceden su presupuesto

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D02, D03, D13, D15; hallazgos AUD-01, AUD-17; historias 12, 19, 61, 62, 64, 65, 66, 67, 75; escenarios S22-09, S22-24, S22-25.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Antes de preparaciones y verificaciones costosas se reserva capacidad compartida, inicialmente dos llamadas en vuelo globales, con expiración/fencing y sin red dentro de SQL.
- [ ] El límite de capacidad externa es distinto del lease de publicación, cuota diaria de 100 envíos y máximo de intentos 3+1; no existe bypass por otra entrada.
- [ ] La elegibilidad usa jitter acotado respetando cooldown mínimo y vencimiento; el ensayo de caída demuestra rechazo temprano y recuperación.
- [ ] Una transacción incierta conserva su identidad y sólo se reconcilia; trabajador vencido no confirma ni libera al sucesor y los predecesores mantienen orden.
- [ ] Cron, API y ledger controlado muestran continuidad SQL y estados honestos bajo saturación; un breaker sólo se añade si el ensayo documenta que los controles presentes no alcanzan.

