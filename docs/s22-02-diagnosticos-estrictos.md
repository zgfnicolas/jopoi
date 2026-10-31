# S22-02 · Diagnóstico del perfil estricto completo

Informe temporal: **59 diagnósticos pendientes** con TypeScript 7.0.2. No acredita aceptación de S22-10. El ticket 07 debe exigir cero diagnósticos y retirar esta tolerancia.

Configuración SHA-256: `ff76897c7df754690eaafadda2bede8eccd072f19a39ebb5b07d3324dc5eea2a`. Se heredan íntegramente include/exclude del perfil vigente; se agregan noUncheckedIndexedAccess y exactOptionalPropertyTypes sin quitar strict.

## Por área

| Área | Diagnósticos |
| --- | ---: |
| scripts | 15 |
| tests | 44 |

## Por archivo

| Archivo | Diagnósticos |
| --- | ---: |
| scripts/acceptance.ts | 2 |
| scripts/create-topic.ts | 1 |
| scripts/database.ts | 1 |
| scripts/delivery.ts | 2 |
| scripts/s21-benchmark.ts | 7 |
| scripts/s21-report.ts | 2 |
| tests/api/contactos-y-consulta.test.ts | 1 |
| tests/api/persistencia.test.ts | 5 |
| tests/api/publicacion.test.ts | 11 |
| tests/api/recorrido.test.ts | 1 |
| tests/api/seguridad.test.ts | 3 |
| tests/cli/entrega.test.ts | 1 |
| tests/e2e/accesibilidad.spec.ts | 1 |
| tests/e2e/sistema-ui.spec.ts | 1 |
| tests/seo/production.ts | 4 |
| tests/support/client.ts | 1 |
| tests/support/ipc.ts | 1 |
| tests/support/ledger.ts | 1 |
| tests/support/runtime.ts | 3 |
| tests/support/tls-certificate.ts | 1 |
| tests/ui/tokens.test.ts | 9 |

Reproducí el detalle con `npm run typecheck:strict` (devuelve error mientras haya pendientes) o `npm run typecheck:report` (genera JSON, texto completo y resumen en .cache/quality). Para actualizar esta instantánea ejecutá `npm run typecheck:report -- --snapshot` y revisá el diff. El informe no agrega casts, supresiones ni exclusiones.
