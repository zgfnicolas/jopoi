# 06: Validar CLI, configuración y arneses con tipos estrictos

**What to build:** Dar al responsable herramientas operativas que rechacen argumentos o recursos incompletos y a los mantenedores pruebas aisladas sin incertidumbres de tipos ocultas.

**Blocked by:** 02 · Preparar verificaciones reproducibles y la expansión del tipado estricto

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D06, D19; hallazgos AUD-05, AUD-08, AUD-16; historias 29, 31, 32, 33, 34, 78, 81, 83; escenarios S22-10, S22-29, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Argumentos CLI, resultados SQL de diagnóstico, objetos opcionales y recursos de prueba comprueban existencia antes de usarse.
- [ ] CLI, configuración y tests corrigen sus diagnósticos del perfil completo sin casts de escape, non-null assertions nuevas o exclusiones.
- [ ] Ayuda y rechazo de argumentos siguen sin cargar secretos ni conectar servicios; archivos explícitos mantienen su política de no fallback.
- [ ] Se verifica exportación, selección de entorno y aislamiento del arnés con entradas sintéticas y sin usar la base habitual.
- [ ] Las pruebas existentes siguen aprobadas y los reportes distinguen ejecución local, ledger controlado y evidencia externa.

