# S20 · Implementación y validación local

Rama: `feature/s20-sistema-ui-accesibilidad-y-seo`. La ejecución local conserva la decisión de S19: sin aprovisionar infraestructura, iniciar sesión ni desplegar en Vercel.

## Alcance implementado

La portada explica la propuesta, los participantes, el proceso y el ejemplo económico antes de los detalles técnicos. Conserva los importes calculados, las limitaciones del prototipo y el formulario real. Las acciones se expresan en español; el anchor `book-a-demo` se mantiene para enlaces existentes.

El sistema compartido incorpora tokens claros/oscuros, apariencia Sistema/Claro/Oscuro, variantes y tamaños de acciones, campos y select nativos, avisos semánticos y resumen de validación. Se aplica a navegación, inicio, panel operativo, trazabilidad y recuperación de errores. No cambia el dominio, los contratos SQL/HCS ni las intenciones idempotentes.

`DESIGN.md` es la referencia normativa. Su sidecar contiene extensiones derivadas. Los pares de color y la correspondencia entre documento, CSS y fallback sin JavaScript tienen una comprobación reproducible.

## Política de indexación

- Únicamente el inicio de `VERCEL_ENV=production` con `APP_URL` HTTPS válido es indexable y declara canonical.
- Demo, trazabilidad y el resto de páginas heredan noindex/nofollow; las dos primeras lo declaran además explícitamente. Las APIs devuelven `X-Robots-Tag` sin alterar autorización ni payloads.
- Preview y desarrollo no declaran canonical del inicio. Robots permite leer noindex; el sitemap está vacío fuera de Production y contiene únicamente el inicio dentro de Production.
- Open Graph, Twitter e icono usan contenido genérico. La imagen social es estática, sin consultas ni generación por recorrido. JSON-LD se limita a WebSite con nombre, idioma y origen validados.

La indexación se decide durante el build. Cambiar `APP_URL` o el entorno exige reconstruir el despliegue. Noindex no sustituye la autorización ni protege un enlace público conocido.

## Tema y seguridad

El bootstrap de tema es una cadena estática, sin datos interpolados, cookies ni secretos; solo modifica `data-theme` en html. El layout conserva renderizado en servidor. El CSS sigue la preferencia del sistema mientras no haya elección explícita; por eso responde también a cambios del sistema sin listeners de JavaScript. El selector escucha cambios entre pestañas y tolera Storage bloqueado.

El repositorio no define actualmente una CSP. No se añadió `unsafe-inline` ni se relajó ninguna política. Si el hosting incorpora una CSP estricta, debe permitir **el hash SHA-256 de los bytes exactos de `THEME_BOOTSTRAP`** (incluidos sus espacios) y las fuentes de scripts necesarias para Next. Se puede calcular con `createHash("sha256").update(THEME_BOOTSTRAP).digest("base64")`; cada modificación de la cadena requiere renovar el hash. Sin autorización del script, el fallback CSS sigue siendo utilizable, aunque no se puede garantizar una elección almacenada antes de pintar. No se debe introducir un nonce por petición únicamente para resolver el tema de una página estática.

## Comprobaciones reproducibles

Con Node 24 disponible en PATH, usar `npm.cmd` en PowerShell:

| Comando | Límite observado |
| --- | --- |
| `npm.cmd run test:ui:tokens` | Contraste numérico de pares y correspondencia de tokens/fallback/documentación. |
| `npm.cmd run test:e2e` | Recorridos existentes y S20 en Chromium escritorio y WebKit móvil, ambos claros y oscuros. |
| `npm.cmd run test:seo` | Builds normales Production/Preview; HTTP/HTML sin JavaScript; captura de inicio en ambos temas; tres mediciones Lighthouse móviles. |
| `npm.cmd run test:cli` | Compatibilidad de las herramientas de entrega y entorno de S19. |
| `npm.cmd run test:api` | Persistencia, contratos y reglas mediante PostgreSQL aislado y Hedera controlado. |
| `npm.cmd run typecheck` | Contratos TypeScript de aplicación, scripts y pruebas. |
| `npm.cmd run db:validate` | Validez del esquema Prisma sin migraciones nuevas. |

API y E2E comparten exclusión de recursos; ejecutarlos secuencialmente. El runner SEO usa el build normal de producción, no permite los alias del harness y sella todas las credenciales de aplicación. Sus solicitudes son lecturas locales y no publican hitos. Lighthouse usa Chromium propio, nunca un navegador personal abierto.

Artefactos privados e ignorados: `.cache/e2e/html`, `.cache/e2e/report.json`, `.cache/s20-ui/contrast.json`, `.cache/s20-seo/report.json`, `.cache/s20-seo/performance.json` y capturas PNG de Production por tema/ancho. Los informes registran huella del código; los resultados parciales no aprueban toda la matriz.

## Resultados y límites

La ejecución final de navegador aprobó **64/64 casos** en una pasada, sin reintentos automáticos: 16 por proyecto en Chromium escritorio y WebKit móvil, con temas claro y oscuro. Duración aproximada: 1,6 h en el equipo local de 3,8 GB. Los dos casos S20 pasaron en las cuatro variantes; axe no detectó infracciones de las reglas WCAG incluidas en las superficies analizadas. Esto no sustituye la revisión manual completa.

También aprobaron las **28 pruebas API**, las **15 pruebas CLI**, las **2 comprobaciones de tokens/contraste**, TypeScript y la validación de Prisma. Los dos builds normales de Production/Preview y sus comprobaciones HTTP/HTML sin JavaScript aprobaron sobre el código definitivo. Los informes API, navegador y SEO tienen la misma huella de código.

Lighthouse móvil, tres ejecuciones sobre producción local con throttling simulado: mediana **LCP 0,94 s**, **CLS 0** y **TBT 235 ms**. TBT no representa INP. Los informes completos guardan las condiciones y cada muestra; estas cifras no acreditan métricas de campo.

Una comprobación adicional sobre el build de producción aprobó texto ampliado por CSS al **200 % en escritorio de 1440 px** y orientación horizontal de **WebKit emulado a 844 × 390**, en ambos temas. El resultado y las capturas están en `.cache/s20-seo/responsive.json` y el mismo directorio. Es una prueba dirigida de texto/reflow; no se presenta como una comprobación del zoom de la interfaz del navegador.

El agregador devuelve `ui: APROBADO` y `api: APROBADO`. La aceptación global continúa `BLOQUEADO`: faltan las evidencias remotas de E2E-12/13/14 y la entrega sigue con cambios sin commit. No se ejecutó aceptación live. Se cerraron los procesos propios y se eliminaron únicamente los dos clústeres sintéticos detenidos de ejecuciones interrumpidas, tras verificar propiedad y rutas.

Se revisaron capturas de inicio Production a 390/1440 px, panel a 320/390 px y trazabilidad expandida en escritorio, en ambas apariencias, además de colores forzados en Chromium. Se comprobó carga de la foto, legibilidad de estados y datos largos, controles y placa clara del QR. Son revisión interna y evidencia visual; no equivalen a aprobación del responsable ni a pruebas con público objetivo. No se generaron ni aprobaron goldens ciegamente.

Los intentos iniciales expusieron timeouts de preparación/carga de Next dev con memoria limitada. Se corrigió la preparación del harness: páginas y archivos cliente antes de API, precarga global, creación de página posterior al reinicio y archivos de capturas en disco. La traza conserva red y DOM. No se ampliaron los 15 s del cliente, los 120 s de prueba ni los presupuestos de acciones/aserciones/fixture acordados en S19; tampoco se incorporaron reintentos de producto. La pasada final completa es la evidencia de navegador vigente.

La revisión de lector de pantalla NVDA + Chrome en Windows requiere una sesión humana documentada; no se infiere de axe. Zoom de navegador real, comprensión con público objetivo y aprobación visual del responsable tampoco se sustituyen por ausencia de overflow. Los anchos automatizados comprueban reflow y las capturas permiten revisión visual; no constituyen una certificación WCAG 2.2 AA.

Los informes Lighthouse describen laboratorio móvil con throttling simulado, servidor local sin CDN y Chromium headless. TBT no equivale a INP. Las metas LCP ≤2,5 s, CLS ≤0,1 e INP ≤200 ms de campo quedan sujetas a datos reales del despliegue; no se presentan como comprobadas por un build o una captura.

El despliegue, la validación de CSP efectiva del hosting y las métricas de campo permanecen pendientes por decisión previa. No se publica el spec en un tracker sin configurar.
