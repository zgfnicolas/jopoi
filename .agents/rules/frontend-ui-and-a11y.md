---
trigger: glob
globs: "**/src/app/**/*.tsx, **/src/app/**/*.css, **/src/components/**/*.tsx, **/src/frontend/**/*.ts"
description: "Reglas de sistema de diseño industrial, tokens CSS, accesibilidad WCAG 2.2 AA y honestidad del prototipo (S12-S15, S20)."
---

# Reglas de Frontend, UI y Accesibilidad (S12–S15, S20)

- **Sistema de diseño (`@DESIGN.md`):** Mantener la estética de ficha de abastecimiento industrial. Usar exclusivamente los tokens CSS definidos en `src/app/globals.css` (sin colores hex/rgb ni espaciados mágicos hardcodeados). Ejecutar `npm run test:ui:tokens` tras editar estilos.
- **Frontera cliente/servidor:** Los archivos en `src/frontend/` y `src/components/` nunca importan de `src/server/`. Toda comunicación pasa por contratos de `src/shared/`.
- **Accesibilidad (WCAG 2.2 AA):** Usar HTML semántico, soporte completo de teclado, foco visible, contraste AA en temas claro y oscuro, y objetivos táctiles de al menos 44×44 px en móvil.
- **Principios de comunicación (`@PRODUCT.md`):**
  - En español claro; presentar el beneficio operativo y económico antes de mencionar blockchain/Hedera.
  - Identificar explícitamente qué datos son ficticios de demostración (empresas, pesos, fotos, importes) y qué se registra realmente en Hedera testnet.
  - Mostrar de forma diferenciada el estado operativo de la carga, el estado de publicación en HCS y el estado de verificación del hash.
