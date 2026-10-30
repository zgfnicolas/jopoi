# 16: Cerrar sesiones y hacer efectivo el vencimiento por inactividad

**What to build:** Permitir que el visitante cierre su sesión y que una sesión abandonada deje de autorizar datos privados sin borrar la evidencia pública vigente.

**Blocked by:** 15 · Proteger la sesión HTTPS y sus mutaciones con CSRF

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D10, D18; hallazgos AUD-13; historias 45, 46, 47, 49, 50, 76; escenarios S22-16, S22-17, S22-18, S22-29.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] DELETE de sesión devuelve 204 idempotente, exige la defensa aplicable, revoca en servidor y elimina cookie; repetirlo no crea sesión.
- [ ] Se conservan padres necesarios para relaciones históricas y enlaces públicos siguen su propia retención; revocación bloquea comandos, lecturas privadas y CSRF.
- [ ] Se aplican 60 min de inactividad y 24 h absolutas con reloj del servidor; actividad se persiste como máximo cada cinco minutos y no estira el máximo absoluto.
- [ ] La interfaz informa política y cierre/vencimiento y retira la vista privada; refresh/replay no reviven la credencial.
- [ ] Migración aditiva/backfill y dos versiones coexistentes tienen pruebas de compatibilidad; condiciones de carrera y límite temporal exacto se verifican por HTTP/navegador.

