# S22-02 · Diagnóstico del perfil estricto completo

Informe temporal: **0 diagnósticos pendientes** con TypeScript 7.0.2. No acredita aceptación de S22-10. El ticket 07 debe exigir cero diagnósticos y retirar esta tolerancia.

Configuración SHA-256: `ff76897c7df754690eaafadda2bede8eccd072f19a39ebb5b07d3324dc5eea2a`. Se heredan íntegramente include/exclude del perfil vigente; se agregan noUncheckedIndexedAccess y exactOptionalPropertyTypes sin quitar strict.

## Por área

| Área | Diagnósticos |
| --- | ---: |


## Por archivo

| Archivo | Diagnósticos |
| --- | ---: |


Reproducí el detalle con `npm run typecheck:strict` (devuelve error mientras haya pendientes) o `npm run typecheck:report` (genera JSON, texto completo y resumen en .cache/quality). Para actualizar esta instantánea ejecutá `npm run typecheck:report -- --snapshot` y revisá el diff. El informe no agrega casts, supresiones ni exclusiones.
