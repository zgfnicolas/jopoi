# S22-01 · Dependencias de Hedera seguras

Fecha de revisión: 2026-10-30. Alcance: ticket 01, historias 21–23 y 85, escenarios S22-07 y S22-31. Responsable de mantenimiento: mantenedor del repositorio Jopoi.

## Decisión y compatibilidad

Se conserva `@hiero-ledger/sdk@2.90.1` con `ethers@6.16.0`. Un override de npm, limitado a esas dos versiones y a su descendiente `ws`, reemplaza `ws@8.17.1` por `8.21.0`. La copia independiente de `ws@8.22.0` permanece intacta. El lockfile registra únicamente el cambio de versión, URL e integridad de esa copia transitiva.

La consulta al registro del 2026-10-30 confirma que el SDK más reciente sigue siendo 2.90.1 y fija ethers 6.16.0. Ethers 6.17.0 ya fija ws 8.21.0, pero adoptarlo bajo el SDK ampliaría innecesariamente el cambio. Se elige un parche dentro del mismo major de ws, con APIs utilizadas por ethers compatibles con Node 24. No se ejecutó `npm audit fix --force`, ni se degradó el SDK.

Revisá el override al actualizar el SDK o ethers, y como máximo el 2026-11-30. Retiralo cuando la cadena declarada resuelva una versión corregida; verificá de nuevo instalación, árbol efectivo, transporte y regresión. La fecha es una revisión del parche, no una excepción de seguridad.

## Avisos y alcanzabilidad

| Aviso upstream | Riesgo | Versión corregida |
| --- | --- | --- |
| [GHSA-96hv-2xvq-fx4p](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p) | Consumo de memoria mediante fragmentos o chunks pequeños; severidad alta | 8.21.0 |
| [GHSA-58qx-3vcg-4xpx](https://github.com/websockets/ws/security/advisories/GHSA-58qx-3vcg-4xpx) | Exposición de memoria al cerrar con ciertos TypedArray; severidad moderada | 8.20.1 |

La inspección de `src/server/hedera/sdk.ts` y `mirror.ts` identifica clientes HCS de testnet y consultas HTTP al mirror fijo. No se encontró un servidor WebSocket de la aplicación ni un WebSocketProvider creado con una URL del visitante. Esto limita la exposición observada, pero no demuestra que el paquete transitivo sea inalcanzable en todos los caminos del SDK. Ambos avisos se remedian por versión, sin excepción.

Una copia segura en la raíz no alcanza: las pruebas resuelven ws desde el SDK y luego desde ethers, igual que la dependencia afectada.

## Comprobación reproducible

Usá Node 24; en este entorno se verificó con 24.22.1. La instalación de CI no ejecuta scripts de terceros y las pruebas de seguridad usan solamente Node y conexiones loopback:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ls @hiero-ledger/sdk ethers ws --omit=dev
npm run test:security
npm run security:audit
npm run security:audit:all
```

Las pruebas de transporte intercambian un mensaje sintético, comprueban los bytes exactos de cierre con Uint8Array, exigen el rechazo de Float32Array y rechazan cinco fragmentos cuando el máximo permitido es cuatro. No intentan agotar memoria. La prueba de fragmentación falló por timeout con la copia anterior, que ignoraba ese límite.

Las pruebas del gate ejecutan el comando real `security:audit` contra un registro HTTP local con avisos sintéticos: moderado permite continuar, alto/crítico devuelve error y un registro indisponible también devuelve error. El registro y la configuración de npm quedan aislados de credenciales locales. Se usan archivos JavaScript nativos para poder ejecutar estas comprobaciones después de `npm ci --ignore-scripts`, sin generar Prisma ni importar la aplicación.

Para verificar publicación y contraste sin transacciones reales, ejecutá además:

```sh
npm run db:generate
npm run typecheck
npm test
```

La suite HTTP provisiona PostgreSQL descartable y sustituye el proveedor HCS por un ledger controlado. Comprueba la regresión del flujo; no acredita una publicación real en testnet. El transporte ws se prueba por separado contra la dependencia efectiva instalada.

## Análisis continuo y tratamiento de excepciones

`.github/workflows/dependency-security.yml` instala desde lockfile, prueba el transporte y el gate, y rechaza avisos altos/críticos de producción en pull requests y cambios de main. También analiza todas las dependencias semanalmente y por ejecución manual. Una falla del registro no se interpreta como auditoría limpia. Los avisos moderados se revisan según alcanzabilidad e impacto; no se ocultan del informe.

El workflow usa acciones fijadas por SHA, permisos de lectura, checkout sin credenciales persistidas y ningún secreto. No actualiza paquetes, publica código, despliega ni envía mensajes HCS. Su ejecución remota queda pendiente de abrir un PR, integrar en main o iniciarlo manualmente en GitHub. Exigirlo mediante protección de rama requiere configurar el repositorio remoto.

No hay excepciones vigentes. Cualquier excepción propuesta debe registrar advisory, paquete/rango, evidencia de alcanzabilidad, mitigación, responsable nominal, aprobación y vencimiento no mayor a 30 días. Al vencer se debe remediar o revisar explícitamente. El gate actual no tiene allowlist ni mecanismo para omitir avisos altos/críticos: documentar una excepción no habilita automáticamente la integración. Los dos avisos de esta entrega requieren versión corregida.

## Evidencia de ejecución

Resultados locales del 2026-10-30 con Node 24.22.1:

| Comprobación | Resultado |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Instalación limpia correcta desde lockfile |
| Árbol efectivo de producción | SDK 2.90.1 → ethers 6.16.0 → ws 8.21.0 |
| Auditoría de producción | Antes: 3 paquetes afectados, 1 alto y 2 moderados por propagación de los dos avisos; después: 0 vulnerabilidades |
| `npm run security:audit:all` | 0 vulnerabilidades, incluidas dependencias de desarrollo |
| `npm run test:security` | 7/7 aprobadas; transporte efectivo y fallo controlado del gate |
| `npm run db:generate` y `npm run typecheck` | Correctos |
| `npm test` | 43/43 aprobadas en 5 archivos; publicación, contraste, reintentos y persistencia con PostgreSQL descartable y ledger controlado |

Los archivos crudos de auditoría de producción se conservan en `.cache/s22-01`, fuera del control de versiones; la regresión HTTP produce `.cache/api-tests/results/report.json`. Esta nota conserva las conclusiones revisables. El control de dependencias cubre la parte aplicable de S22-31: las puertas integrales restantes corresponden a otros tickets.
