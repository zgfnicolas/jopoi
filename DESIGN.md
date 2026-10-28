---
name: Jopói
description: Ficha de abastecimiento industrial, regional y verificable.
colors:
  surface: "#fafbf8"
  panel: "#ffffff"
  subtle: "#edf1eb"
  ink: "#192e2e"
  muted: "#526462"
  line: "#c8d2ca"
  control-border: "#6b7e76"
  action: "#145b58"
  action-hover: "#0c403e"
  on-action: "#ffffff"
  danger: "#a82424"
  warning: "#7a4b00"
  success: "#1d6b45"
  info: "#1d587d"
  signal: "#efd45c"
  dark-surface: "#111c1b"
  dark-panel: "#182826"
  dark-subtle: "#203531"
  dark-ink: "#edf4ef"
  dark-muted: "#b6c7bf"
  dark-line: "#3a5149"
  dark-control-border: "#7f9d91"
  dark-action: "#81d1bd"
  dark-action-hover: "#a0e0d0"
  dark-on-action: "#101f1c"
  dark-danger: "#ffaaa4"
  dark-warning: "#f2ce79"
  dark-success: "#8dd8b0"
  dark-info: "#9acbf0"
typography:
  caption:
    fontFamily: 'system-ui, sans-serif'
    fontSize: ".875rem"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.6
  lead:
    fontFamily: 'system-ui, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  title:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  section:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.2
  page:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.2
  display:
    fontFamily: '"Barlow Semi Condensed", "Arial Narrow", sans-serif'
    fontSize: "clamp(2.5rem, 4.5vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.15
rounded:
  sm: ".25rem"
  md: ".5rem"
spacing:
  space-1: ".25rem"
  space-2: ".5rem"
  space-3: ".75rem"
  space-4: "1rem"
  space-5: "1.25rem"
  space-6: "1.5rem"
  space-8: "2rem"
  space-10: "2.5rem"
  space-12: "3rem"
  space-16: "4rem"
  space-24: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.sm}"
    padding: ".5rem 1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.action}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: ".75rem"
  notice:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.25rem"
---

# Design System: Jopói

## Overview

La identidad se conserva: una ficha de abastecimiento industrial, con petróleo, neutros vegetales, amarillo señal localizado, títulos condensados y fotografía de referencia con atribución. La portada presenta la propuesta y orienta; la demo permite operar; la trazabilidad permite leer y contrastar. No trasladar la composición promocional al panel operativo.

S20 amplía esta identidad a Sistema, Claro y Oscuro. Este documento define las reglas normativas; las variables compartidas de globals.css las materializan. El sidecar contiene extensiones derivadas, sin otra paleta independiente. Los importes se calculan en el dominio y los formatos se comparten; el diseño no inventa precios, empresas, beneficios ni capacidades.

## Colors

Los tokens sin prefijo corresponden a Claro; dark-* sustituye el rol homónimo en Oscuro. Surface es el fondo general, panel el plano de control, subtle el fondo secundario. Ink y muted siempre se leen sobre esos fondos. Line es decorativo; control-border identifica límites interactivos. Action/on-action forman un par inseparable, también en hover. Amarillo no significa éxito y la selección siempre usa tinta oscura fija.

Danger, warning, success e info identifican estados junto con texto explícito. Avisos: fondo subtle, texto ink y título/borde del rol semántico. Nunca aplicar blanco literal a una acción oscura. El QR conserva píxeles y placa blanca propios; no aplicar filtros a fotos ni códigos.

Medir contraste efectivo: texto normal 4,5:1; texto grande y límites/indicadores requeridos 3:1. No sustituir estas comprobaciones por la legibilidad de una captura. Los bordes decorativos tienen otra función. Colores forzados conservan foco y controles nativos.

## Typography

Barlow Semi Condensed 600 se sirve localmente para títulos y marca. System-ui sirve lectura y controles. El rol visual no determina el nivel HTML: un h1 por página y jerarquía lógica. Usar los tamaños del frontmatter y sus variables --text-*. El display es exclusivo del inicio, con interlineado 1,15; títulos generales 1,2 y lectura 1,6. Mantener 60–72ch de lectura continua y texto ampliable sin recortes.

Usar cifras tabulares para kg, ARS y fechas comparables. Reservar monoespaciado para identificadores/payloads cuando ayude a contrastarlos. No reducir tipografía para encajar datos largos: envolver o habilitar desplazamiento local rotulado.

## Layout

Escala base 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96, expresada en rem. Agrupar con 8–12 px; campos y bloques internos con 16–24; módulos con 32–48; secciones con 40–64. Contenedor máximo 72rem, margen móvil 16px y margen amplio hasta 32px. Los cortes de composición implementados son 40rem y 64rem. Hay ajustes de contenido en 25rem para roles/desglose económico y en 42rem para los campos de contacto; no se necesita otra recomposición a 80rem.

Stack y actions son patrones compartidos; facts/record-facts son listas de datos. Campos alineados, leyendas persistentes y acciones en orden DOM. Tablas y payloads pueden desplazarse dentro de regiones accesibles, nunca toda la página a 320px equivalentes. No ocultar acciones en hover ni añadir menú móvil si los enlaces pueden envolver.

Validar 320/360/390/768/1024/1440 px, ampliación 200 %, reflow 400 %, teclado, tacto y ambas apariencias. La matriz de evidencia y las limitaciones manuales se registran en docs/s20-validacion.md.

## Elevation & Depth

Profundidad documental: planos de tono, espaciado y divisores antes que sombras. Foco de 3px con separación de 4px, visible sin depender del color del fondo. El enlace de salto usa la capa 20; no introducir una escala abierta de z-index. No hay animación decorativa ni tarea que dependa de movimiento; respetar la preferencia reducida.

## Shapes

Radios pequeños de 4 y 8px para controles y avisos. Controles independientes de al menos 44px; CTA destacados de 48px. No convertir todos los datos en tarjetas. Los enlaces dentro de texto conservan su comportamiento nativo; la meta táctil de producto no reemplaza las excepciones de WCAG.

## Components

ActionButton y ActionLink comparten variant primary|secondary|quiet y size default|large. La variante es exclusiva. Extienden propiedades nativas, ref y className. Los enlaces navegan; los botones ejecutan. Default, hover, focus-visible y active mantienen contraste; disabled muestra cursor not-allowed, busy aria-busy y cursor progress, con etiqueta de progreso explícita.

Field, TextAreaField y SelectField conservan labels, props nativas, errores e instrucciones mediante aria-describedby. Los controladores mantienen valores y claves de intención; las primitivas no consultan APIs. La validación mueve foco al primer campo pertinente y los errores asociados no generan una cascada de alertas repetidas. Resúmenes y confirmaciones importantes reciben foco; las lecturas rutinarias no lo roban.

Notice admite info|success|warning|error, con anuncios optativos. Error urgente usa alert; el resto status cuando corresponde. Advertencias de cupo o conflicto no implican pérdida de los datos guardados. Separar estado operativo, publicación y verificación; conservar las etiquetas explícitas existentes. Details/summary resuelven expansión sin controles de teclado propios.

Apariencia usa select nativo Sistema/Claro/Oscuro. Sistema es el valor inicial y CSS sigue cambios de prefers-color-scheme sin listeners innecesarios. Una elección explícita se conserva en jopoi.theme; ignorar valores inválidos y tolerar almacenamiento bloqueado. El bootstrap estático se ejecuta antes de pintar; únicamente html admite la diferencia de atributo. Sin JavaScript permanece el contenido y el tema del sistema. El layout sigue en servidor. La recuperación global comparte tema y acciones.

## Do's and Don'ts

- Comunicar propuesta, participantes y límites antes de la tecnología. Mantener el caso de Corrientes identificado como ficticio.
- Usar Solicitar una demostración; conservar el anchor existente para enlaces compartidos. El formulario guarda una solicitud, sin reservar fecha ni enviar correo.
- Conservar imágenes locales, dimensiones reservadas, sizes adecuados y carga prioritaria solo de la imagen principal.
- Indexar únicamente el inicio en Production con APP_URL HTTPS válido; demo y trazas noindex/nofollow. Preview no es indexable. No añadir datos privados a canonical, sitemap ni vistas sociales.
- No convertir todo el layout en cliente, introducir una biblioteca universal ni duplicar árboles por tema.
- No afirmar conformidad WCAG, aprobación de lector de pantalla o métricas de campo a partir de pruebas automatizadas.
