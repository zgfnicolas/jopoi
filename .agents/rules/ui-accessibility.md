---
trigger: glob
globs: "src/app/**/*.tsx, src/components/**/*.tsx, src/app/**/*.css"
description: "Reglas para componentes visuales, diseño y accesibilidad WCAG 2.1 AA."
---

# Reglas de Interfaz de Usuario y Accesibilidad

- **Tokens del sistema de diseño:** Utilizar exclusivamente los tokens CSS semánticos definidos en `DESIGN.md` y materializados en `src/app/globals.css` (ej. `var(--action)`, `var(--surface)`, `var(--ink)`, `var(--signal)`). Queda prohibido hardcodear códigos HEX arbitrarios o clases utilitarias de color desconectadas del sistema.
- **Contraste estricto WCAG 2.1 AA:**
  - Todo texto normal debe mantener una relación de contraste mínima de **4.5:1** contra su fondo.
  - Controles interactivos, bordes y texto grande deben mantener un contraste mínimo de **3:1**.
  - El cumplimiento debe verificarse tanto en modo Claro como en modo Oscuro mediante la suite `tests/ui/tokens.test.ts`.
- **Jerarquía tipográfica:**
  - Títulos de página, secciones y marca: utilizar la variable `--font-heading` (*Barlow Semi Condensed*, peso 600).
  - Texto de lectura continua, tablas y formularios: utilizar `system-ui`.
  - Máximo un único elemento `<h1>` semántico por página.
- **Tamaños y accesibilidad motriz:**
  - Todo control interactivo independiente (botones, selects, campos) debe tener una altura mínima accesible de **44px** (`var(--control-height)`).
  - Las acciones deben tener etiquetas visibles o descriptores `aria-label` inequívocos.
- **Semántica de interacción:**
  - Los enlaces navegan (`ActionLink` o `<a>`).
  - Los botones ejecutan mutaciones o disparan acciones locales (`ActionButton` o `<button>`).
  - Respetar la preferencia `prefers-reduced-motion` evitando animaciones decorativas no solicitadas.
