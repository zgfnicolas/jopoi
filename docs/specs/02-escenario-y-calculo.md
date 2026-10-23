# S02 · Escenario precargado y explicación económica

Área: Backend · datos de ejemplo. Tamaño relativo: S. Dependencias: S01.
Estado: base implementada el 2026-10-22 según el plan aprobado, en `feature/s02-escenario-y-calculo`. Snapshot, cálculo y recursos disponibles; integración SQL/API y pruebas pendientes de sus specs. Sin publicar como issue.

## Problem Statement

Un visitante no puede comprender el beneficio de Jopói si debe preparar empresas, rutas, comprobantes y precios antes de probar el recorrido. A la vez, la demo no puede inventar clientes o resultados observados.

## Solution

Preparar un escenario reproducible de chips forestales sin tratar, con un comprador y dos viajes, y un cálculo económico ilustrativo que responda a los datos del lote.

## User Stories

1. Como visitante, quiero iniciar con un lote listo para explorar, para entender el producto sin cargar documentación.
2. Como generador representado, quiero reconocer el material y su origen, para comprender qué estoy ofreciendo.
3. Como coordinador representado, quiero comparar dos viajes con sus condiciones, para explicar la compatibilidad.
4. Como comprador representado, quiero ver material, flete y tarifa por separado, para comprender el costo total.
5. Como visitante, quiero comparar con una alternativa de transporte, para entender el beneficio ilustrativo.
6. Como visitante, quiero saber qué datos son ficticios, para no confundir el prototipo con actividad comercial.
7. Como visitante, quiero que cambiar la cantidad actualice los importes, para explorar cómo influye en la operación.
8. Como responsable del prototipo, quiero poder identificar la versión del escenario, para interpretar recorridos creados antes de un cambio de semilla.

## Implementation Decisions

- Solo chips forestales sin tratar en un corredor ilustrativo de Santa Rosa, Corrientes. Empresas, rutas, horarios, distancias, importes, imágenes y pesajes se presentan como ejemplos, sin atribuir clientes reales.
- Propuesta de semilla v1: cantidad 12.000 kg, humedad 28%, requisito máximo del comprador 35%; un viaje de retorno con capacidad 18.000 kg y condiciones compatibles; otro de 8.000 kg con carrocería y horario incompatibles.
- Cada viaje declara material admitido, capacidad, carrocería, compatibilidad de ruta y ventana de ejemplo. No se consulta GPS, tráfico ni un motor geográfico externo.
- Propuesta económica v1 en ARS: material 18.000 por tonelada, flete de retorno fijo 90.000, tarifa Jopói fija 18.000 y alternativa dedicada fija 165.000. Son datos sintéticos reemplazables, no cotizaciones ni una decisión comercial definitiva.
- Costo con Jopói = material más retorno más tarifa; alternativa = mismo material más flete dedicado; diferencia = alternativa menos costo con Jopói. No ocultar una diferencia negativa ni llamarla ahorro cuando no lo sea.
- Ejemplo trabajado independiente: con 12.000 kg, material 216.000, total con Jopói 324.000, alternativa 381.000 y diferencia 57.000. No afirmar margen neto del transportista ni del generador.
- Fotos y comprobante de pesaje precargados, con origen y derecho de uso documentados al producirlos. Su contenido y sus leyendas no afirman que pertenezcan a una entrega real.
- Conservar la versión y los valores del escenario usados por cada recorrido; cambiar el catálogo no reescribe el historial ni el hash de recorridos anteriores.
- Representar cantidades e importes con precisión decimal explícita. No usar redondeo visual como validación del peso recibido.
- Implementación aprobada: gramos y centavos enteros en la aritmética interna; material redondeado una sola vez a centavos con mitad hacia arriba. Salidas monetarias como cadenas con dos decimales. Las fotos son referencias libres con atribución, ajenas a una operación real; el comprobante es un SVG ficticio estático del escenario inicial.

### Criterios de aceptación

1. El escenario permite explicar por qué un viaje es inicialmente compatible y el otro no.
2. El ejemplo económico produce los importes literales especificados y etiqueta su carácter ilustrativo.
3. El visitante no necesita subir imágenes ni contactar empresas para completar el recorrido.
4. Un cambio de escenario no altera datos ya publicados de un recorrido anterior.

## Testing Decisions

Los casos de semilla y cálculo se recogerán en S17; su presentación visual, en S18. No se implementan tests en esta etapa.

## Out of Scope

Cotizaciones reales, precios actualizados de mercado, optimización de rutas, mapas GPS, métricas de carbono, gestión comercial de empresas y subida de evidencia.

## Further Notes

Q2, Q11–Q14, Q23 y Q30. La semilla v1 aprobada al implementar sigue siendo ilustrativa y no procede de una validación de mercado. El [registro de implementación](../escenario-y-calculo.md) detalla contratos, recursos, redondeo y verificaciones. La persistencia histórica y las reglas de asignación se integrarán en S03/S06; no se dan por implementadas en S02.
