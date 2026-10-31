# Esquema oficial de OpenAPI 3.2

Fuente: [OpenAPI 3.2 schema, 2025-09-17](https://spec.openapis.org/oas/3.2/schema/2025-09-17). Descargado el 2026-10-31, sin modificaciones. SHA-256: `0c9d74bf25f9b9388b2d81e421ef60fdefa9feffa94898dadfc501b342b3bfcc`.

El esquema oficial valida la estructura OpenAPI y deja los Schema Objects como object/boolean. La suite también compila separadamente todos los schemas de la aplicación con JSON Schema 2020-12 y contrasta las respuestas HTTP reales con el artefacto publicado.

Ajv documenta que los anchors dinámicos solo funcionan en raíz: [limitaciones de referencias dinámicas](https://ajv.js.org/guide/combining-schemas.html#extending-recursive-schemas). Aquí `meta` está en `$defs/schema`. Como esta prueba no extiende ese anchor, se resuelven en memoria sus referencias al mismo `#/$defs/schema`, preservando la regla object/boolean. No se modifica el archivo oficial ni se omiten las reglas de OpenAPI. Controles negativos verifican rechazo de otra versión y headers con propiedades prohibidas.
