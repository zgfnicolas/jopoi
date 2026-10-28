# S20 · Interfaz coherente, inicio descriptivo, accesibilidad y SEO

Estado: implementación local de S20 completada y validaciones automáticas aprobadas. Límites confirmados: Playwright para UI, HTTP/HTML para SEO y regresión API para contratos. Evidencia y pendientes manuales/remotos en [validación S20](../s20-validacion.md). La revisión visual y de lector de pantalla se registra por separado. Sin publicación en tracker ni despliegue; conserva las capacidades y contratos actuales de la demo.

## Problem Statement

Una persona interesada en Jopói debe entender qué ofrece la propuesta, a quién ayuda y cómo conocerla. El inicio actual abre con el caso de chips y un viaje de retorno: transmite un ejemplo concreto, pero la explicación general del negocio puede quedar subordinada al escenario y a sus cifras ilustrativas. Los accesos mezclan español con «Book a demo».

La interfaz ya tiene una identidad industrial y componentes compartidos, pero solo ofrece tema claro. La documentación no define de forma exhaustiva tamaños, subtipos, variantes, estados y reglas de composición. La extensión a nuevas pantallas puede introducir diferencias en tipografía, espacios, campos, acciones y avisos. El SEO actual incluye metadatos básicos y exclusión de demo/trazas, pero no una política completa para portada, previews, sitemap y contenido compartido.

El responsable quiere mejorar toda la UI con una base uniforme, modular, reutilizable y extensible: HTML semántico, accesibilidad, SEO, temas claro y oscuro, responsive y reglas de UI/UX orientadas al público de Jopói.

## Solution

Extender la identidad industrial existente a un sistema de diseño documentado y comprobable. Aplicarlo a inicio, navegación y pie, formulario de solicitud de demo, consulta por identificador, panel operativo, trazabilidad y estados transversales de carga, error, vacío, vencimiento y página inexistente.

El público principal son empresas generadoras de materiales aprovechables, compradores industriales, transportistas y coordinadores o aliados regionales. La comunicación será clara, en español de Argentina y comprensible sin conocer PostgreSQL, blockchain ni el funcionamiento interno del prototipo. El contexto regional de Corrientes y los chips forestales se conservan como ejemplo identificado.

La portada comunica la propuesta; la demo permite operar; la trazabilidad permite leer y contrastar. Las tres superficies comparten lenguaje visual y accesibilidad, con composiciones distintas según su tarea. El éxito requiere comprender la oferta, encontrar los accesos y completar los recorridos existentes en ambos temas y distintos tamaños, sin cambios de reglas ni afirmaciones comerciales inventadas.

## User Stories

1. Como visitante nuevo, quiero comprender qué coordina Jopói desde el primer bloque, para decidir si la propuesta me interesa.
2. Como visitante nuevo, quiero distinguir la propuesta del ejemplo de chips forestales, para entender su propósito sin confundir un escenario con todo el negocio.
3. Como generador, quiero reconocer cómo se declara y ofrece un material aprovechable, para identificar mi participación.
4. Como comprador, quiero entender cómo se evalúa la compatibilidad del material, para saber qué decisiones representa la demo.
5. Como transportista, quiero comprender el papel del viaje de retorno y su capacidad, para identificar cuándo puede resultar compatible.
6. Como coordinador, quiero ver cómo se relacionan lote, comprador y transporte, para explicar la operación.
7. Como aliado regional, quiero conocer el contexto de Corrientes, para evaluar la relevancia de la propuesta.
8. Como visitante, quiero identificar qué está disponible en el prototipo, para no asumir que existe un mercado comercial activo.
9. Como visitante, quiero distinguir datos ficticios de registros reales en testnet, para interpretar correctamente la evidencia.
10. Como visitante, quiero entender el flujo en pocos pasos, para explorar la demo sin un tutorial técnico previo.
11. Como visitante, quiero ver los supuestos junto al ejemplo económico, para no interpretar sus cifras como ahorros garantizados.
12. Como visitante, quiero acceder claramente a «Probar demo», para experimentar el recorrido guiado.
13. Como persona interesada, quiero encontrar «Solicitar una demostración», para pedir conocer el prototipo mediante el formulario existente.
14. Como persona interesada, quiero saber qué ocurre al enviar el formulario, para distinguir una solicitud de una reserva confirmada.
15. Como persona con un identificador, quiero encontrar la consulta de trazabilidad, para abrir el historial sin crear una cuenta.
16. Como visitante, quiero textos y controles consistentes en español, para comprender las acciones sin cambiar de idioma.
17. Como visitante, quiero reconocer la misma navegación y estructura entre pantallas, para orientarme.
18. Como visitante, quiero saber en qué sección estoy, para regresar al inicio o continuar mi tarea.
19. Como visitante, quiero elegir tema claro, oscuro o del sistema, para leer con comodidad.
20. Como visitante, quiero conservar mi preferencia de tema entre visitas, para no configurarla repetidamente.
21. Como visitante que usa el tema del sistema, quiero que se respeten sus cambios, para mantener mi preferencia automática.
22. Como visitante con almacenamiento bloqueado, quiero seguir utilizando el sitio, para que el tema no impida la navegación.
23. Como persona con baja visión, quiero textos y controles con contraste suficiente en ambos temas, para distinguir contenido y acciones.
24. Como persona que amplía el texto, quiero que el contenido se reorganice, para leer sin perder información.
25. Como persona que navega con teclado, quiero foco visible y orden lógico, para completar todas las acciones.
26. Como persona que usa lector de pantalla, quiero encabezados y regiones semánticas, para recorrer la información por su estructura.
27. Como persona que usa lector de pantalla, quiero nombres, descripciones y errores asociados a los campos, para corregir mi solicitud o declaración.
28. Como persona sensible al movimiento, quiero una experiencia reducida coherente, para conservar orientación sin efectos molestos.
29. Como visitante móvil, quiero objetivos táctiles cómodos, para accionar controles sin activar elementos vecinos.
30. Como visitante móvil, quiero completar el panel y los formularios sin desplazamiento horizontal global, para trabajar desde una pantalla pequeña.
31. Como visitante en tablet o escritorio, quiero usar el espacio disponible con jerarquía clara, para comparar datos sin perder la secuencia.
32. Como visitante, quiero diferenciar enlaces y botones, para anticipar navegación y ejecución de acciones.
33. Como visitante, quiero reconocer una acción en curso, para no repetir envíos por falta de respuesta visual.
34. Como visitante, quiero conservar mis datos ante errores y conflictos, para recuperar la tarea sin empezar de nuevo.
35. Como visitante de la demo, quiero distinguir estado operativo, envío y verificación, para no confundir una acción guardada con una confirmación de red.
36. Como visitante, quiero que éxito, advertencia y error tengan texto e indicaciones coherentes, para comprenderlos sin depender del color.
37. Como visitante, quiero recibir avisos importantes sin anuncios repetitivos, para mantener la concentración.
38. Como visitante, quiero entender un estado vacío o vencido y su siguiente paso, para continuar o salir con claridad.
39. Como persona que consulta trazabilidad, quiero leer cantidades, fechas e identificadores largos, para contrastar el historial desde cualquier dispositivo.
40. Como persona que comparte una consulta, quiero conservar un QR legible en ambos temas, para abrir la misma lectura pública.
41. Como visitante con conexión lenta, quiero leer la propuesta antes de que cargue la interacción, para comprender el sitio sin depender de JavaScript.
42. Como visitante, quiero imágenes contextualizadas y con alternativas textuales adecuadas, para entender qué representan.
43. Como visitante que comparte el inicio, quiero una vista previa descriptiva, para comunicar qué ofrece la propuesta.
44. Como responsable, quiero que los buscadores encuentren la portada correcta, para presentar el proyecto con título y descripción fieles.
45. Como responsable, quiero mantener fuera del índice la demo y las trazas, para evitar publicar recorridos temporales como páginas comerciales.
46. Como responsable, quiero que Preview y desarrollo no compitan con Production en buscadores, para mantener una URL canónica coherente.
47. Como mantenedor, quiero componentes comunes con variantes explícitas, para ampliar la interfaz sin duplicar estilos y comportamiento.
48. Como mantenedor, quiero separar presentación y reglas de negocio, para modificar la UI sin alterar persistencia ni trazabilidad.
49. Como mantenedor, quiero tokens y ejemplos de estados documentados, para reproducir el sistema en nuevas superficies.
50. Como mantenedor, quiero pruebas de comportamiento y revisión visual en ambos temas, para detectar regresiones reales sin acoplarlas a nombres de clases.

## Implementation Decisions

### Alcance y dirección visual

- Conservar la identidad «Ficha de abastecimiento industrial»: petróleo, neutros, amarillo señal localizado, títulos condensados, datos alineados, divisores y fotografía de material contextualizada. Extenderla; no introducir una nueva marca, un logo no aprobado ni una estética genérica de dashboard.
- Modo Persuade para inicio: explicar propuesta y motivar exploración/contacto. Modo Operate para demo: priorizar tarea, compatibilidad y siguiente acción. Modo Read para trazabilidad: priorizar historial, lectura y contraste. La composición promocional no se replica dentro del panel.
- Mantener la finalidad de prototipo personal y presupuesto cero de los ADR. No inventar clientes, testimonios, certificaciones, disponibilidad de cargas, precios comerciales, ahorros observados ni garantías de sostenibilidad o calidad.
- Conservar cálculos exactos, idempotencia, roles simulados, aislamiento, cuotas, retención, recuperación y separación entre SQL y HCS. No modificar contratos de datos ni introducir pagos, chat, cuentas empresariales, calendarios o un catálogo comercial.

### Arquitectura del inicio y contenido

Secuencia propuesta:

1. **Propuesta y audiencia.** H1 descriptivo propuesto: «Jopói: coordinación de materiales, compradores y transporte». Bajada: «Una propuesta para conectar empresas que generan materiales aprovechables con quienes los necesitan y coordinar su traslado. Explorá el prototipo con un lote ficticio de chips forestales en Corrientes». Identificar desde el inicio el carácter de prototipo.
2. **Accesos.** Primario «Probar demo»; secundario «Solicitar una demostración». Conservar el destino y ancla actuales del formulario. «Consultar trazabilidad» sigue disponible en navegación y en un bloque identificable, sin competir con el inicio del recorrido.
3. **Para quién.** Generador, comprador, transportista y coordinador: necesidad, aporte y resultado esperado dentro de la propuesta. Usar definiciones del glosario, no categorías de usuarios nuevas.
4. **Cómo funciona.** Declarar un lote; evaluar requisitos; asignar un transporte compatible; confirmar retiro; registrar recepción conforme o incidencia. Explicar que el rechazo puede cerrar el caso durante la revisión.
5. **Ejemplo regional.** Chips forestales, recorrido y comparación económica obtenidos del escenario existente. Mantener moneda ARS, supuestos y carácter ilustrativo junto a los datos, sin convertirlos en tarifas o promesas comerciales.
6. **Trazabilidad y límites.** Explicar qué se guarda, qué se registra en testnet y qué se puede contrastar. La tecnología queda en un segundo nivel de lectura; no acredita la carga física.
7. **Preguntas frecuentes.** Qué se puede probar, si requiere cuenta, qué datos son ficticios, qué verifica el QR y qué ocurre con la solicitud de demo. Respuestas basadas exclusivamente en capacidades actuales.
8. **Contacto y consulta.** Formulario existente y consulta por identificador con etiquetas claras, validación y estados completos. Pie con contexto del prototipo, navegación útil y atribuciones necesarias, sin enlaces de políticas inexistentes.

El contenido principal debe estar en el HTML servido. No crear una ruta duplicada llamada «index». No esconder toda la explicación en acordeones. Mantener párrafos breves y títulos concretos; usar listas, definiciones y tablas según la relación entre datos. Sustituir «Book a demo» por español en toda la interfaz, sin cambiar el comportamiento de la solicitud.

### Sistema de tokens y reglas

Documentar una fuente normativa de tokens y consumirla desde CSS compartido; los módulos de superficie contienen composición y los componentes sus variantes. Actualizar el documento de diseño y su representación derivada durante la implementación de S20, sin crear dos fuentes de verdad. No incorporar una biblioteca completa ni un framework de estilos para duplicar los controles existentes.

Paleta inicial propuesta para los roles principales; confirmar los pares en el render y ajustar los valores si no cumplen el contraste exigido:

| Rol | Claro | Oscuro |
| --- | --- | --- |
| Fondo general | #FAFBF8 | #111C1B |
| Superficie | #FFFFFF | #182826 |
| Superficie secundaria | #EDF1EB | #203531 |
| Texto principal | #192E2E | #EDF4EF |
| Texto secundario | #526462 | #B6C7BF |
| Línea decorativa | #C8D2CA | #3A5149 |
| Borde de control | #6B7E76 | #7F9D91 |
| Acción | #145B58 | #81D1BD |
| Hover de acción | #0C403E | #A0E0D0 |
| Texto sobre acción | #FFFFFF | #101F1C |
| Error | #A82424 | #FFAAA4 |
| Advertencia | #7A4B00 | #F2CE79 |
| Éxito | #1D6B45 | #8DD8B0 |
| Información | #1D587D | #9ACBF0 |
| Señal de marca | #EFD45C | #EFD45C |

- Diferenciar tokens de marca, roles semánticos y pares fondo/texto de componentes. Definir fondo y texto juntos para avisos y estados. Ningún significado depende solo de un hexadecimal. Los bordes decorativos no sustituyen el contraste necesario para reconocer un control. El amarillo no implica éxito.
- Evitar blanco literal en botones: el tema oscuro usa su token de texto sobre acción. El QR conserva una placa clara y margen suficiente, sin inversión automática del gráfico. Las fotografías mantienen sus colores y créditos.
- Tipografía: conservar Barlow Semi Condensed local 600 para títulos y system-ui para lectura y controles. Escala en rem con roles caption 0,875; label/body/control 1; lead 1,125; title 1,5; section 2; page 2,5; display hasta 4,5 de forma fluida. Las categorías visuales no determinan el nivel HTML de un encabezado.
- Interlineado de lectura 1,5–1,6 y títulos 1,15–1,25, comprobando cortes. Lectura continua de aproximadamente 60–72 caracteres por línea. Cifras tabulares para cantidades/importes y estilo monoespaciado solo donde facilite contrastar identificadores o payloads.
- Espaciado base de 4 px, expresado en rem: pasos 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 y 96. Asignar roles de separación interna, entre controles, grupos y secciones; no introducir un número nuevo por cada componente.
- Controles con altura mínima de producto de 44 px; acciones destacadas de 48 px. Radios pequeños de 4 y 8 px; divisores antes que sombras. Documentar densidad, bordes, anchos máximos, capas y foco. Usar una escala de capas acotada para salto de contenido y elementos superpuestos.
- Estándar de estados: default, hover, focus-visible, active, disabled, busy, error y success donde correspondan. Deshabilitado y ocupado tienen motivos y semánticas distintas; un control deshabilitado no muestra siempre cursor de espera. Definir igualmente advertencia, vacío, conflicto, indisponibilidad y vencimiento.

### Temas claro y oscuro

- Selector accesible «Apariencia» con Sistema, Claro y Oscuro, compartido en todas las superficies. Primera visita en Sistema; una elección explícita se conserva localmente sin datos personales. Escuchar cambios del sistema únicamente en ese modo.
- Resolver la apariencia antes de la primera pintura sin convertir la portada en una página dependiente de cookies o JavaScript para su contenido. Compatibilidad con la política de seguridad del proyecto; no debilitar CSP para resolver el tema. Evitar destellos y discrepancias de hidratación; no silenciar advertencias globalmente.
- Sin JavaScript, ofrecer la preferencia del sistema mediante CSS. Si el almacenamiento está bloqueado, mantener el cambio durante la sesión y continuar sin errores. No usar filtros que inviertan toda la página ni duplicar el árbol de contenido por tema.
- Definir color-scheme, controles nativos, selección, foco, estados, payloads, enlaces, imágenes, QR y vistas de error en ambos temas, incluida la recuperación global de errores.

### Componentes, módulos e interfaces

| Nivel | Responsabilidad y ejemplos |
| --- | --- |
| Fundamentos | Tokens, tipografía, contenedores, ritmo, foco y responsive. |
| Primitivas | Botón de acción, enlace de navegación/acción, campo, textarea, select nativo, ayuda, error y aviso. |
| Patrones | Grupo de campos, resumen de errores, sección con título, lista de datos, tabla comparativa, estado y bloque expandible. |
| Estructura | Cabecera, navegación activa, selector de apariencia, main, pie y límites de error/carga. |
| Funcionalidades | Comparación económica, solicitud de demo, localizador, rol/tarea operativa, historial, evento, contraste y bloque de compartir. |

- Extender las primitivas actuales con variantes, tamaños y tonos explícitos, propiedades nativas pertinentes, nombres accesibles y composición de estilos controlada. No acumular booleanos que permitan combinaciones contradictorias; definir qué combinaciones son válidas y su estado visual.
- Mantener enlaces como enlaces y acciones como botones. Un bloque de datos no se convierte automáticamente en tarjeta ni una lista en una tabla. Preferir HTML nativo para select, details y formularios; no crear controles personalizados cuyo teclado haya que reinventar sin una necesidad demostrada.
- Separar presentación de controladores de funcionalidades y acceso a datos. Las primitivas no consultan API, no conocen Prisma ni HCS y no cambian reglas del dominio. Las funcionalidades reutilizan sus hooks y contratos actuales, conservando intenciones, protección contra duplicados y recuperación.
- Reutilizar formatos de kg, humedad, ARS, fechas y precisión existentes. No copiar importes o estados a constantes de diseño ni redondear datos de negocio para resolver el layout.
- Crear ejemplos verificables de variantes, temas y estados mediante las herramientas de desarrollo/pruebas existentes; no introducir una galería pública ni Storybook como obligación de esta fase.

### Semántica, accesibilidad y responsive

- Objetivo WCAG 2.2 AA en las superficies incluidas. No declarar conformidad por obtener una puntuación automática. Un h1 descriptivo por página, jerarquía lógica, regiones header/nav/main/footer identificables y enlace de salto funcional.
- Formularios con label persistente, instrucciones, obligatoriedad y errores asociados. Agrupar campos relacionados cuando proceda; mover foco al primer error o resumen pertinente y a confirmaciones importantes sin robar foco durante lecturas rutinarias. Mantener valores ante fallos y resultados inciertos.
- Foco visible y no oculto; orden DOM y lectura coherentes con la presentación. No usar tabindex positivo. Details conserva su summary accesible. Anunciar cambios significativos con status/alert según urgencia, evitando repetir en cada actualización todo el historial o valores sin cambios.
- Contraste mínimo: 4,5:1 para texto normal, 3:1 para texto grande conforme a su definición y 3:1 en límites/indicadores no textuales donde WCAG lo exija. Comprobar colores efectivos y estados en ambos temas. Iconos decorativos ocultos al lector; controles con iconos tienen nombre accesible.
- Objetivo táctil de producto de 44 × 44 px para acciones independientes. Distinguirlo del mínimo WCAG AA de 24 × 24 y sus excepciones; tratar los enlaces en texto según su contexto, sin prometer una regla universal de 44 px para cada palabra enlazada.
- Mobile first; contenedor máximo de 72rem, padding fluido de 16–32 px y puntos iniciales de composición en 40rem, 64rem y 80rem, ajustados por contenido. Probar 320, 360, 390, 768, 1024 y 1440 px, ambas orientaciones relevantes, texto ampliado y zoom.
- Sin scroll horizontal de página a 320 px equivalentes ni contenido esencial oculto. Las tablas o payloads que lo necesiten pueden desplazarse dentro de una región local accesible y rotulada; los identificadores deben poder leerse/copiarse sin romper la columna.
- No ocultar acciones críticas en hover ni exigir gestos de arrastre. Mantener navegación utilizable al envolver enlaces en móvil; no introducir un menú complejo si la navegación existente puede adaptarse con claridad.
- Respetar movimiento reducido y colores forzados; no eliminar indiscriminadamente señales útiles. No añadir carruseles automáticos, animaciones decorativas permanentes ni efectos que bloqueen la tarea.

### SEO, carga y compartición

- Mantener el contenido descriptivo del inicio renderizado en servidor. Título y descripción propios, idioma es-AR, encabezados que expresen contenido y enlaces rastreables. No usar metadatos como sustituto de texto visible.
- En Production, indexar la portada y declarar su canonical con el origen validado real. Mantener demo y trazas noindex/nofollow; excluirlas del sitemap. Preview y entornos no productivos no se presentan como sitio indexable.
- Incorporar robots y sitemap mediante las convenciones de la versión instalada de Next.js. El sitemap incluye solo páginas públicas indexables reales; no anclas, UUID de recorridos ni URLs inventadas. Evitar bloquear el rastreo de páginas cuyo noindex deba leerse. Noindex no es autorización ni garantía de privacidad.
- Definir Open Graph, vista previa social e iconos con nombre, descripción y activos coherentes. Ninguna vista previa incluye datos personales, secretos o detalles de un recorrido. Las trazas mantienen una descripción genérica y su política de no indexación.
- Datos estructurados iniciales limitados a WebSite con información verificada. No inventar dirección legal, horarios, reseñas, precios, Organization o LocalBusiness para aparentar una empresa operativa. No prometer posiciones ni resultados enriquecidos.
- Conservar fuentes y activos locales, dimensiones reservadas, tamaños responsive y la carga prioritaria solo del recurso visual principal cuando corresponda. Verificar que la foto se haya cargado en la captura; un rectángulo reservado no acredita un recurso correcto. Carga diferida bajo el primer bloque y fallback comprensible ante errores de imagen.
- Reducir JavaScript a interacción, tema y funcionalidades que lo requieren. No convertir todo el layout en un componente cliente por incorporar apariencia. Medir sobre build de producción; los tiempos de compilación de Next dev no son Core Web Vitals.
- Objetivos de rendimiento de referencia: LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1 cuando haya muestra real suficiente. En laboratorio registrar condiciones, mediciones y limitaciones; Lighthouse no acredita INP de campo ni accesibilidad completa.

### Secuencia de implementación y cierre

Inventario y matriz de estados; consolidación de tokens y tema; primitivas y estructura compartida; portada y contenido; panel y trazabilidad; metadatos e indexación; regresión funcional, accesibilidad y revisión visual. Actualizar la documentación normativa junto al código que la materializa. No declarar finalizada una pantalla por estar correcta solo en el tema claro o en su estado ideal.

## Testing Decisions

- **Límite principal propuesto:** navegador real mediante la suite Playwright existente. Observar contenido, nombres accesibles, foco, teclado, tacto, navegación, estados y resultado de las acciones. No probar nombres de clases, estructura interna de React ni detalles de composición privados.
- **Límite complementario:** HTTP/HTML servido para metadata, canonical, robots, sitemap y noindex, incluyendo contenido del inicio sin ejecutar JavaScript. Reutilizar la regresión de API actual para comprobar que el rediseño no altera contratos o reglas.
- **Antecedentes:** las pruebas existentes ya cubren escritorio Chromium, móvil WebKit emulado, teclado, foco del formulario, 320/768/1440 px, QR, contexto público separado, errores SQL, incertidumbre, cuotas y vencimientos. Conservar ese comportamiento y ampliar temas/semántica/SEO en la misma infraestructura; no crear otro harness de sesiones o base.
- **Temas:** primera visita en Sistema, claro/oscuro explícitos, persistencia, cambio del sistema, almacenamiento no disponible y navegación entre superficies. Comprobar primera pintura, consola e hidratación; ejecutar recorridos críticos completos en ambos temas y motores, sin un producto cartesiano innecesario de todos los anchos y cada estado.
- **Accesibilidad:** integrar un analizador automatizado compatible con Playwright y revisar cada hallazgo; completarlo con teclado, foco no oculto, zoom 200 % y reflow a 400 %, movimiento reducido, colores forzados y una revisión manual de lector de pantalla en una combinación documentada. Lo no ejecutado queda pendiente, sin declararlo aprobado.
- **Semántica y contenido:** verificar landmarks, h1/jerarquía, labels, ayudas, errores asociados, ausencia de nombres vacíos y preservación de datos al fallar. Actualizar aserciones ligadas al copy anterior según el nuevo contenido aprobado, sin eliminar los escenarios para hacer pasar la suite.
- **Comprensión:** al revisar el primer bloque debe poder responderse qué propone Jopói, para quién, cómo se prueba y qué es ficticio. Revisar texto y composición con ese criterio; no presentar una revisión interna como investigación validada con clientes.
- **Visual:** capturas identificadas por ruta, ancho, tema y estado de inicio, panel, formulario y trazabilidad, incluyendo errores, datos largos y QR. Revisar el render antes de aprobar goldens; no aceptar capturas nuevas ciegamente ni usar solo ausencia de overflow como prueba de buen layout.
- **Contraste:** calcular pares de tokens y comprobar colores efectivos en componentes renderizados, incluyendo hover, foco y avisos. Las excepciones normativas de controles inactivos no sustituyen su legibilidad de producto.
- **SEO y privacidad:** portada Production con canonical válido; Preview noindex; demo y trazas noindex legible; sitemap sin IDs ni rutas de sesión; vistas previas sin contactos. No incluir credenciales literales en fixtures: usar valores sintéticos generados en ejecución cuando sean necesarios.
- **Rendimiento:** medir producción con un perfil móvil documentado y revisar desplazamientos, carga de la imagen principal y coste de tema/JS. Registrar límites del laboratorio; la aceptación de métricas de campo queda pendiente de datos reales.
- **Cierre:** tipos y build satisfactorios, regresión API y navegador aprobada, criterios manuales revisados en ambas apariencias, documentación consistente y ausencia de defectos bloqueantes conocidos. Preparar la implementación para Vercel sin aprovisionar ni publicar como efecto de esta spec.

## Out of Scope

- Aprovisionar infraestructura o desplegar como efecto de esta implementación local.
- Reemplazar la identidad existente sin una decisión posterior; crear marca nueva, investigación comercial ficticia o activos que aparenten operaciones reales.
- Modificar modelos SQL, reglas de negocio, cuotas, contratos de datos, firma HCS o infraestructura acordada en S19.
- Convertir el prototipo en lanzamiento comercial, introducir servicios pagos o nuevos flujos de ventas, autenticación, pagos, correos o calendarios.
- Prometer certificación WCAG, validación con usuarios, ranking SEO o métricas reales de campo sin evidencia.
- Crear un CMS, un catálogo empresarial universal de componentes, una galería pública de estilos o traducciones completas a otros idiomas.

## Further Notes

### Evaluación inicial y límites de evidencia

- **P1 · Tema y estados incompletos:** la paleta global fija color-scheme claro; no hay selector ni tokens oscuros. Es una brecha respecto al alcance solicitado, no una violación WCAG demostrada por sí sola.
- **P2 · Normas incompletas:** tamaños, espacios y bordes aparecen como valores locales; faltan roles exhaustivos para variantes y estados. La dirección industrial sí es consistente y debe conservarse.
- **P2 · Extensibilidad:** los controles compartidos existen, pero el enlace admite pocas propiedades nativas y el botón reemplaza la clase del consumidor. Ampliar composición y contratos de variantes sin perder semántica ni estados accesibles.
- **P2 · Contenido inicial:** el caso específico precede a una explicación general y hay CTA en inglés. La nueva arquitectura prioriza oferta, actores y capacidades reales del prototipo.
- **P2 · SEO:** hay título/description generales y noindex de demo/trazas; no se encontraron sitemap, robots ni una estrategia completa de canonical/compartición en las convenciones de la aplicación.
- **A conservar:** main, salto al contenido, navegación activa, labels y errores asociados, controles con altura mínima, datos semánticos, imágenes locales con atribución y pruebas E2E por roles y comportamiento.
- **Pendiente de medición:** contraste efectivo de estados, lector de pantalla, rendimiento de producción y matriz visual nueva. No se asigna una puntuación de conformidad a partir de una lectura estática.

El diagnóstico inicial se basó en código, documento de producto, sistema de diseño, glosario, ADR y capturas E2E existentes de S18. Una captura del inicio mostraba un área de imagen vacía y motivó comprobar su carga. Durante la implementación S20 se verificó la fotografía cargada y se revisaron nuevos renders claros/oscuros, además de ejecutar axe, pruebas de navegador y comprobaciones sobre builds normales de producción. Los resultados y límites están en la validación enlazada.

El detector inicial de Impeccable emitió avisos de tamaños fuera de su rampa documentada y el contexto informó un sidecar desactualizado. S20 consolidó la escala normativa, los tokens consumidos por CSS y la representación derivada dentro de su alcance autorizado. La revisión de capturas y las comprobaciones automáticas complementan ese diagnóstico estático.

Fuentes normativas: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [tamaño mínimo de objetivos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), [foco no oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) y [noindex de Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing). La implementación deberá consultar además las guías incluidas en la versión instalada de Next.js.

La documentación del proyecto mantiene el tracker sin configurar. Publicación y etiqueta `ready-for-agent` pendientes, no aplicadas. Ejecutar `/setup-matt-pocock-skills` para configurar el destino. Los límites de prueba fueron confirmados al planificar la implementación. La identidad industrial se conserva; S20 actualiza su documento de diseño y representación derivada junto con el código.
