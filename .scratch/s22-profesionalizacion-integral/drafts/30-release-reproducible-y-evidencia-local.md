# 30: Cerrar la entrega local con regresión y evidencia reproducibles

**What to build:** Producir una revisión candidata verificable que reúne todos los flujos S22 y comunica con precisión qué está implementado y qué falta probar fuera del entorno local.

**Blocked by:** 01 · Resolver los avisos de seguridad del SDK de Hedera; 07 · Activar el perfil estricto completo y retirar compatibilidad de tipos; 25 · Detectar incidentes con salud, objetivos y alertas accionables; 26 · Medir la experiencia real sin exportar datos privados; 28 · Dimensionar admisión y pool con carga de producción; 29 · Ensayar migraciones y restauración sin alterar evidencia

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D01, D04, D07, D19, D20, D21; hallazgos AUD-01, AUD-02, AUD-03, AUD-04, AUD-05, AUD-06, AUD-07, AUD-08, AUD-09, AUD-10, AUD-11, AUD-12, AUD-13, AUD-14, AUD-15, AUD-16, AUD-17; historias 1, 2, 4, 21, 23, 29, 30, 31, 32, 33, 34, 35, 36, 38, 75, 76, 78, 81, 82, 83, 84, 85, 87, 88; escenarios S22-01, S22-02, S22-03, S22-04, S22-05, S22-06, S22-07, S22-08, S22-09, S22-10, S22-11, S22-12, S22-13, S22-14, S22-15, S22-16, S22-17, S22-18, S22-19, S22-20, S22-21, S22-22, S22-23, S22-24, S22-25, S22-26, S22-27, S22-28, S22-29, S22-30, S22-31, S22-32.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Gate integral ejecuta instalación reproducible, Prisma offline/aislado, tipos completos, lint, OpenAPI contrastado, API, CLI, UI, build, E2E y laboratorio con la misma revisión/fingerprint.
- [ ] Una regresión real bloquea integración/release; PR no confiable no recibe secretos y el runner de migración permanece separado.
- [ ] Matriz enlaza 17 AUD y seis DoD con decisiones, casos y resultados, diferenciando implementado, local comprobado y evidencia externa/campo pendiente.
- [ ] Compatibilidad antigua/nueva y preservación de los tres caminos del recorrido se demuestran juntas; no se retiran adaptadores HTTP antes del plazo/evidencia exigidos.
- [ ] Se deja el procedimiento y validador de candidato externo preparados, con rechazo explícito de evidencia faltante; este cierre local no aprovisiona, despliega ni envía HCS real.

