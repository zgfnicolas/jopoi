# S15 · Página pública de trazabilidad y QR

Área: Frontend · lectura verificable. Tamaño relativo: L. Dependencias: S11, S12, S14.
Estado: implementada; revisión visual pendiente por falta de navegador conectado. Ver [implementación y límites](../trazabilidad-publica-y-qr.md). Pruebas de comportamiento reservadas a S17/S18.

## Problem Statement

La persona que recibe un enlace necesita leer el historial y comprobar la prueba disponible sin convertirse en propietaria del recorrido ni interpretar una declaración ficticia como entrega real.

## Solution

Definir una página pública de solo lectura con QR o enlace compartible, hitos ordenados, detalle contrastable y estados honestos de confirmación y verificación.

## User Stories

1. Como persona que recibe un QR, quiero abrir la trazabilidad sin cuenta, para leer el recorrido.
2. Como visitante propietario, quiero copiar el enlace de consulta, para compartirlo sin compartir mi sesión.
3. Como persona que consulta trazabilidad, quiero distinguir hechos de aplicación y resultados de red, para entender cada hito.
4. Como persona que consulta trazabilidad, quiero contrastar el detalle y su hash, para revisar la declaración.
5. Como persona que consulta trazabilidad, quiero abrir la referencia de testnet, para realizar una comprobación externa.
6. Como persona que consulta trazabilidad, quiero saber si falta confirmación o lectura remota, para no asumir éxito.
7. Como persona que consulta trazabilidad, quiero reconocer rechazo o incidencia, para no confundirlo con recepción conforme.
8. Como persona que consulta trazabilidad, quiero entender un recorrido vencido o no disponible, para interpretar el límite de retención.

## Implementation Decisions

- Página /trazabilidad/{traceId} sin registro y sin botones de publicar, aprobar, asignar, retirar, recibir, reiniciar o reintentar envíos.
- QR generado localmente a partir del origen público configurado y el identificador validado de la consulta. No incluir token de sesión, claves ni parámetros privados, ni usar un generador remoto que reciba esos datos.
- Siempre ofrecer enlace textual accesible y copiable junto al QR. La demo no exige cámara ni escáner para completar ninguna acción.
- Mostrar marca de demo, material, empresas ficticias, declaración, recepción y línea de hitos con roles simulados. Presentar los datos precargados como ilustrativos, sin afirmar certificación física.
- Cada hito presenta fecha de aplicación, estado de publicación, confirmación y resultado de contraste como conceptos distintos. El timestamp de consenso solo se muestra cuando se conoce.
- Detalle verificable por hito con versión, payload público y digest. El control de contraste solo consulta la verificación de S11; no dispara publicación ni consume reintentos de escritura.
- Estados de lectura explícitos: sin hitos, pendiente de envío, resultado incierto, confirmado con mirror pendiente, coincidencia, discrepancia, indisponible y vencido.
- Enlaces a explorador o mirror de testnet con texto descriptivo. No mostrar URLs de mainnet ni enlaces arbitrarios tomados de entradas del visitante.
- Al expirar o eliminar el recorrido, sustituir los datos por una explicación de no disponibilidad. No reconstruir una página indefinida desde HCS para eludir la retención acordada.
- Si una pestaña pública está abierta mientras cambia el estado, permitir actualizar con lectura acotada y sin polling permanente. No permitir que una cache muestre datos después del vencimiento.

### Criterios de aceptación

1. El enlace abre sin cookie de propietario y no otorga ninguna acción de escritura.
2. El QR representa únicamente la URL pública y dispone de alternativa textual.
3. Confirmación pendiente y hash discrepante se muestran sin convertirlos en éxito.
4. Una verificación puede abrirse y comprenderse en móvil y con teclado.
5. Después del vencimiento no quedan visibles datos del recorrido por navegación o cache.

## Testing Decisions

S18 verificará compartir, abrir en otra sesión, seguir enlaces, contraste visible y expiración. S17 verifica la proyección y el origen remoto del contraste.

## Out of Scope

Escaneo con cámara, escritura pública, buscador global, certificados descargables de impacto, retención indefinida y regeneración automática desde blockchain.

## Further Notes

Q9, Q17, Q21 y Q25. El QR identifica y permite consultar; no prueba por sí solo peso, composición o custodia física.
