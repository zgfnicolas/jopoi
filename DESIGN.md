---
name: Jopói
description: Ficha de abastecimiento industrial clara, regional y verificable.
colors:
  surface: "#fafbf8"
  subtle: "#edf1eb"
  ink: "#192e2e"
  muted: "#526462"
  line: "#c8d2ca"
  action: "#145b58"
  action-hover: "#0c403e"
  signal: "#efd45c"
  danger: "#a82424"
  white: "#fff"
typography:
  display:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(2.75rem, 4.5vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-.025em"
  headline:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(2rem, 4vw, 3.4rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.025em"
  title:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(1.4rem, 2.2vw, 1.9rem)"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    lineHeight: 1.6
  label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 650
rounded:
  button: ".35rem"
  input: ".3rem"
  notice: ".4rem"
spacing:
  inline: ".75rem"
  stack: "1.25rem"
  section: "clamp(2.5rem, 5vw, 4rem)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: ".65rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.action}"
    rounded: "{rounded.button}"
    padding: ".65rem 1rem"
  button-secondary-hover:
    backgroundColor: "{colors.subtle}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: ".7rem"
    width: "100%"
  notice:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.notice}"
    padding: "1.2rem"
  ledger:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    padding: "1.5rem"
---

# Design System: Jopói

## Overview

**Creative North Star: "Ficha de abastecimiento industrial"**

Superficie clara, petróleo/teal y amarillo señal. La voz visual es concreta y regional: títulos condensados, datos ordenados y divisores precisos hacen legible una operación industrial. La fotografía local de chips aporta materia; la información explica qué se compara y qué evidencia existe.

La landing integra la comparación económica al inicio. Esa composición pertenece a esa superficie: `/demo` y `/trazabilidad/[traceId]` comparten tipografía, navegación, colores, formularios y estados sin adoptar la estructura promocional. Los importes y el escenario se identifican como ilustrativos; el registro testnet no se presenta como certificación física.

Extracción S13 del código, con dirección cualitativa confirmada por el usuario. Fuentes: `src/app/globals.css`, `src/app/page.module.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/ui/ui.module.css`, `src/components/navigation.tsx`, `src/components/demo-request-form.module.css`, formulario y páginas de demo/trazabilidad. No se dispuso de navegador: no hay aprobación visual observada ni verificación de render, contraste calculado o tamaños reales en pantalla. Los tokens representan la implementación leída.

**Key Characteristics:**

- Claridad industrial sobre fondo claro.
- Títulos condensados y lectura en system-ui.
- Petróleo para acción y amarillo para señal.
- Datos tabulares y evidencia con contexto explícito.
- Profundidad por tono y divisores.

## Colors

La paleta combina verdes neutros de baja saturación con petróleo y una señal amarilla localizada. Los valores normativos están en el frontmatter y corresponden a las variables homónimas de `:root`, salvo `white`, literal usado sobre fondos oscuros.

### Primary

- **Petróleo de acción** (`action`): enlaces, botones principales, marcadores y bordes de énfasis.
- **Petróleo profundo** (`action-hover`): hover principal y fondo del pie fotográfico.

### Secondary

- **Amarillo señal** (`signal`): selección de texto.

### Neutral

- **Superficie clara** (`surface`): fondo general e inputs.
- **Plano suave** (`subtle`): avisos, desglose económico y hover secundario.
- **Tinta petróleo** (`ink`): lectura principal y divisores de mayor jerarquía.
- **Texto secundario** (`muted`): ayudas, notas, límites e información complementaria.
- **Línea vegetal** (`line`): separadores, bordes de avisos y estructura documental.
- **Blanco** (`white`): texto de acciones principales y pie de fotografía.

`danger` es el rojo semántico de error: borde de campo inválido, mensaje y aviso de error. No se usa como acento de marca.

**The Señal con contexto Rule.** El amarillo aparece en la selección de texto; no comunica por sí solo una confirmación operativa.

## Typography

**Display Font:** Barlow Semi Condensed, peso local 600, con Arial Narrow y sans-serif como fallback. `next/font/local` carga `src/app/fonts/BarlowSemiCondensed-SemiBold.ttf` con `display: swap` y expone `--font-heading`.

**Body Font:** system-ui y los fallbacks del frontmatter. No se carga una fuente de texto remota.

El contraste entre títulos condensados y texto familiar permite reconocer encabezados sin endurecer la lectura. Encabezados balanceados y palabras largas ajustables protegen títulos e identificadores.

### Hierarchy

- **Display:** título de landing, máximo 18ch.
- **Headline:** h1 compartido de demo y trazabilidad, máximo 24ch.
- **Title:** h2 de secciones; h3 usa 1.1rem y la misma familia/peso.
- **Body:** párrafos de hasta 72ch; introducción de landing a 1.13rem y máximo 46ch.
- **Label:** etiquetas de campos en system-ui con peso 650; el interlineado hereda del body.
- **Datos:** importes, cantidades e identificadores usan números tabulares. Las cantidades destacadas de la comparación usan la familia de títulos.

**The Dos voces Rule.** Reservar Barlow Semi Condensed para títulos, marca y cantidades destacadas; mantener controles y lectura continua en system-ui.

## Layout

El contenido tiene un máximo de 72rem. El ancho general es `min(72rem, calc(100% - 3rem))`; baja a `calc(100% - 2rem)` hasta 42rem. El padding vertical del main es `clamp(2rem, 5vw, 4.5rem)`. Secciones sucesivas usan el ritmo fluido del frontmatter; las secciones documentales agregan borde superior y padding.

La landing abre con columnas 1.1fr/1fr y una ficha comparativa que ocupa ambas. Las parejas de explicación y detalle usan 1fr/1.15fr con separación de 4rem, reducida a 2rem hasta 60rem. Hasta 48rem, pasan a una columna; la fotografía adopta proporción 16/10 y la ficha apila su contenido. La fotografía usa `public/demo/chips-v1/chips-pile.jpg` con recorte cover en escritorio; su pie identifica que es material de referencia y la página conserva los créditos/licencia.

Los cuatro roles pasan a dos columnas hasta 60rem y a una hasta 25rem. El desglose económico apila etiquetas/valores hasta 60rem, los vuelve a alinear hasta 48rem y los apila nuevamente hasta 25rem. El formulario tiene dos columnas y empresa/mensaje a ancho completo; hasta 42rem usa una. Las listas de hechos usan auto-fit con mínimos limitados al ancho disponible. La navegación se envuelve y hasta 42rem ocupa su propia fila; no hay menú oculto.

## Elevation & Depth

El código no define sombras. La profundidad proviene de planos suaves, fotografía, bordes y cambios de grosor. El desglose lleva una línea superior de acción; la ficha inicia con una línea de tinta más fuerte. No hay transición animada en los controles documentados. La preferencia de movimiento reducido desactiva animaciones/transiciones; no implica que existan animaciones en reposo.

**The Profundidad documental Rule.** Construir jerarquía con superficie, espacio y divisores antes de introducir elevación.

## Shapes

Fotografía, ficha y desglose conservan geometría rectangular. Los controles tienen radios pequeños diferenciados, definidos en el frontmatter; los avisos son apenas más suaves. Los bordes corrientes son de 1px; líneas de 2px o 3px jerarquizan casos concretos. No se observa un sistema de chips interactivos ni de tarjetas redondeadas genéricas.

## Components

### Buttons

Acciones firmes, compactas y legibles. Alto mínimo de 2.75rem, peso 650 y borde de acción de 1px. La variante primaria usa texto blanco; la secundaria fondo transparente y texto de acción. Hover cambia el fondo según los tokens. Deshabilitado usa muted para fondo y borde y cursor de espera. El estado ocupado comunica el progreso con texto.

### Inputs / Fields

Campos claros, borde muted de 1px y alto mínimo de 2.75rem. Etiqueta de peso 650, ayuda debajo y error textual en danger. `aria-invalid` cambia el borde a danger. En el formulario bloqueado, campos y textarea usan subtle/muted, opacidad completa y cursor no permitido. Conservar valores y estados de reintento forma parte de la experiencia del formulario.

### Cards / Containers

El aviso es el contenedor compartido: fondo subtle, borde line de 1px, separación interna .4rem; error cambia el borde a danger. No usa sombra. El desglose económico rectangular separa filas con líneas, alinea importes y resalta el total con peso 700 y borde de acción de 2px. Son patrones diferentes, no variantes de una tarjeta universal.

### Navigation

Marca tipográfica condensada; enlaces de texto sin decoración en reposo y espaciado envolvente. `aria-current` activa subrayado y peso 650, incluido el enlace de consulta en rutas públicas de trazabilidad. Los enlaces conservan los mismos destinos y comportamiento compartido entre superficies.

### Comparación económica

Bloque de ficha con cifra condensada y números tabulares. Presentar al lado del importe el carácter ilustrativo y la alternativa comparada. No extraer los importes del escenario como constantes de diseño.

### Foco y estados

Todo elemento enfocable usa el foco global: contorno de acción de 3px con separación de 4px; en colores forzados usa Highlight. El enlace de salto aparece al enfocarse. Los indicadores de estado combinan texto e icono; no dependen solamente del color. Las muestras del sidecar reproducen estados existentes: no añaden animación ni un efecto activo que el código no define.

## Do's and Don'ts

### Do:

- **Do** reutilizar los tokens compartidos en landing, demo y trazabilidad.
- **Do** mantener visibles los límites del escenario ilustrativo y del registro testnet.
- **Do** conservar foco visible, etiquetas, ayudas y mensajes de error textuales.
- **Do** mantener fotografía de referencia y créditos unidos a su contexto.
- **Do** alinear importes con números tabulares y conservar sus supuestos.

### Don't:

- **Don't** convertir la composición inicial de landing en una obligación para las pantallas operativas.
- **Don't** presentar cifras ficticias como ahorros observados ni registros testnet como certificación física.
- **Don't** sustituir los títulos locales por una fuente remota sin una nueva decisión de diseño.
- **Don't** tratar las rampas de presentación del sidecar como tokens implementados.

