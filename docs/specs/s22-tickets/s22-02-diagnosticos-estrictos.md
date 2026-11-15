# S22-02 · Diagnóstico del perfil estricto completo

Perfil obligatorio: **0 diagnósticos** con TypeScript 7.0.2. Cualquier diagnóstico o fallo del compilador devuelve un código distinto de cero, en todas las carpetas.

Configuración SHA-256: `2f0f570149092eefa6caef90a536a13f93d18252d8c8d6c1b38e51d76c8277de` (principal, estricto y API). Las tres opciones están activas en la configuración principal y se heredan en las variantes, conservando sus include/exclude.

## Por área

| Área | Diagnósticos |
| --- | ---: |


## Por archivo

| Archivo | Diagnósticos |
| --- | ---: |


Reproducí el detalle con `npm run typecheck:strict` (devuelve error mientras haya pendientes) o `npm run typecheck:report` (genera JSON, texto completo y resumen en .cache/quality). Para actualizar esta instantánea ejecutá `npm run typecheck:report -- --snapshot` y revisá el diff. El informe no agrega casts, supresiones ni exclusiones.
