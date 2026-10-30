# 27: Mantener rápidas las tres rutas con un gate de producción

**What to build:** Conservar lectura e interacción ágiles en landing, demo y trazabilidad y bloquear regresiones de carga, layout o JavaScript antes de una entrega.

**Blocked by:** 20 · Hacer visible la antigüedad y actualizar antes de editar; 21 · Aplicar CSP estricta sin romper tema, formularios ni QR

**Status:** approved — desglose y dependencias aprobados; pendiente de configurar el tracker y publicar como ready-for-agent.

**Trazabilidad:** Spec S22; decisiones D09, D11, D12, D19; hallazgos AUD-06, AUD-10, AUD-11, AUD-16; historias 33, 35, 43, 44, 51, 53, 56, 57, 59, 81; escenarios S22-15, S22-19, S22-20, S22-21, S22-22, S22-31.

**Marco compartido:** presupuesto cero y ADR vigentes; un lote, comprador y viaje, roles simulados y evidencia HCS testnet. Conservar compatibilidad e invariantes. Probar por HTTP, navegador, CLI o artefacto público pertinente con recursos aislados; esta planificación no autoriza implementar, desplegar, migrar un proveedor ni enviar HCS real.

## Acceptance criteria

- [ ] Se verifica LCP/CLS/TBT con tres corridas del mismo build por ruta/perfil: medianas ≤2,5 s/0,1/250 ms y comparación con base equivalente según S22.
- [ ] JS inicial comprimido incluye framework y módulos requeridos y respeta landing 200 KiB, demo 300 KiB y trazabilidad 250 KiB; QR diferido se mide aparte.
- [ ] Se mantienen prioridad/dimensiones de imagen crítica, fuentes/fallback, skeletons y QR dimensionados, sin micro-boundaries o waterfalls introducidos para bajar una cifra.
- [ ] Navegador comprueba temas, móvil/escritorio, teclado, ausencia de mismatches y funcionamiento bajo CSP; no se agregan suppressHydrationWarning para ocultar fallos.
- [ ] Excesos bloquean el gate, con samples y revisión completos; cualquier excepción requiere medición/decisión explícita, no ajuste silencioso del umbral ni declaración de p75 real.

