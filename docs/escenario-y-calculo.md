# Escenario precargado y cálculo económico

S02 implementada en `feature/s02-escenario-y-calculo`, creada desde `main` con S01 confirmada. La entrega aporta datos versionados, snapshots independientes, precisión decimal, cálculo ilustrativo y recursos locales. Persistencia, reglas de asignación, API y pantallas siguen pendientes de sus specs.

## Escenario chips-v1

`createScenarioSnapshot()` devuelve una copia profundamente congelada de `chips-v1`. El catálogo no se exporta como objeto mutable y cada llamada crea referencias independientes. El resultado contiene datos JSON, sin `bigint`, fechas de ejecución, tokens ni estado operativo.

| Dato | Valor inicial de ejemplo |
| --- | --- |
| Material | Chips forestales sin tratar, a granel. |
| Generador / comprador | Generador Demo Santa Rosa / Comprador Demo Santa Rosa; empresas ficticias. |
| Corredor | Santa Rosa, Corrientes; origen y destino ficticios, 80 km ilustrativos. |
| Cantidad | `12000.000` kg. |
| Humedad / máximo del comprador | `28.00`% / `35.00`%. |
| Carrocería requerida | `BULK_TIPPER`, volcadora para granel. |
| Retiro requerido | 08:00–10:00 del día ilustrativo 0, UTC−03:00. |

Las ventanas se representan con `dayOffset`, minutos desde medianoche y offset fijo de ejemplo. No caducan por el reloj del servidor ni representan una reserva real.

| Condición | Retorno A (`return-a`) | Viaje B (`trip-b`) |
| --- | --- | --- |
| Transportista | Transportista Demo A | Transportista Demo B |
| Material admitido | Chips sin tratar | Chips sin tratar |
| Capacidad disponible | `18000.000` kg | `8000.000` kg |
| Carrocería | Volcadora para granel | Furgón cerrado |
| Ruta | Compatible con el corredor de ejemplo | Compatible con el corredor de ejemplo |
| Retiro | 08:00–10:00 | 14:00–16:00 |

Con los datos iniciales, Retorno A satisface las condiciones. Viaje B incumple capacidad, carrocería y horario. La capacidad es disponibilidad declarada del viaje ficticio, no una inferencia de que un camión está vacío. No se guarda una compatibilidad global permanente: editar la cantidad puede modificar la compatibilidad por capacidad. S06 implementará la evaluación y sus bloqueos; S02 no asigna viajes.

Los motivos precargados tienen código y etiqueta, sin campos libres:

- Rechazo: `HUMIDITY_ABOVE_LIMIT` y `MATERIAL_NOT_AS_DECLARED`.
- Incidencia: `WEIGHT_MISMATCH` y `MATERIAL_ISSUE`.

S06 aplicará el motivo permitido por comando; un motivo de peso solo corresponde si hay diferencia exacta. No se crean transiciones ni se verifica calidad física en S02.

## Contratos de consumo

| Exportación | Entrada y salida |
| --- | --- |
| `createScenarioSnapshot()` | Sin argumentos; devuelve `ScenarioSnapshot` con versión, datos iniciales, requisitos, viajes, precios, motivos y metadata de recursos. |
| `normalizeQuantityKg(value, field?)` | Cadena decimal positiva de hasta tres decimales; devuelve cadena con tres decimales. `field` permite reutilizarla para `receivedKg`. |
| `normalizeHumidityPercent(value)` | Cadena decimal entre 0 y 100 inclusive, hasta dos decimales; devuelve cadena con dos decimales. |
| `calculateEconomics(quantityKg, pricingSnapshot)` | Cantidad actual y precios del snapshot; devuelve desglose, comparación y leyenda ilustrativa. |

Las tres funciones que validan datos devuelven `DomainResult<T>`: `{ ok: true, value }` o `{ ok: false, error: { code, fields } }`. Forma/precisión inválidas usan `INVALID_INPUT`; cantidad cero y humedad superior a 100 usan `RULE_VIOLATION`. Se rechazan signos, exponentes, comas, espacios y precisión adicional, incluso si son ceros finales. Se admiten ceros iniciales y se eliminan al normalizar. Los mensajes no reproducen los valores recibidos.

El código de dominio no importa `process.env`, Next.js, Prisma ni módulos privados de servidor. La futura API validará sus límites de entrada y usará `ApplicationError(code, fields)` más el adaptador de S01 para añadir mensaje público, requestId y estado HTTP.

`parseQuantityGrams` y los helpers de decimal son aritmética interna exacta: los resultados en `bigint` no se envían a JSON. La normalización pública y `EconomicsSummary` solo exponen cadenas decimales. El redondeo monetario no interviene en igualdad de peso declarado/recibido.

Ejemplo de consumo para preparar un nuevo recorrido:

```typescript
import { createScenarioSnapshot } from "../src/domain/scenario";
import { calculateEconomics } from "../src/domain/economics";

const snapshot = createScenarioSnapshot();
const economics = calculateEconomics(snapshot.initialLot.quantityKg, snapshot.pricing);
```

S03 guardará el snapshot completo por recorrido. La declaración editable se mantendrá separada del snapshot inicial: el cálculo recibirá la cantidad vigente del lote y los precios del snapshot persistido. No se cambiará `snapshot.initialLot` para guardar un borrador ni se regenerará el snapshot al recuperar un recorrido.

Para cambiar el catálogo se añadirá una nueva versión; no se sobrescribirá `chips-v1` ni sus archivos. Los cálculos de un recorrido anterior usarán sus propios precios. La persistencia y conservación de eventos/hashes requieren S03 y S07; S02 no afirma haberlas integrado.

## Fórmula y redondeo

Todos los importes son supuestos en ARS. El material cuesta `18000.00` por tonelada; retorno fijo `90000.00`, tarifa Jopói fija `18000.00` y flete dedicado fijo `165000.00`. No hay cotizaciones, impuestos calculados, margen neto ni modelo comercial definitivo.

La cantidad se transforma en gramos enteros y los precios en centavos enteros mediante `bigint`, sin operaciones monetarias en coma flotante:

1. Material = gramos × centavos por tonelada ÷ 1.000.000 gramos por tonelada. Redondear una sola vez al centavo, con mitad hacia arriba.
2. Total Jopói = material redondeado + retorno + tarifa.
3. Alternativa = el mismo material redondeado + flete dedicado.
4. Diferencia = alternativa − total Jopói, sin ocultar el signo.

`EconomicsSummary` incluye `currency`, `isIllustrative`, `disclaimer`, `quantityKg`, `materialCost`, `returnFreight`, `jopoiFee`, `jopoiTotal`, `dedicatedFreight`, `alternativeTotal`, `difference` y `differenceKind` (`saving`, `extra_cost` o `equal`). Los importes se devuelven con dos decimales. Los precios se reciben explícitamente desde el snapshot; no se consultan globales, red ni catálogo vigente.

Los precios admiten cadenas no negativas de hasta dos decimales. El cálculo puede comparar otros snapshots sintéticos en ARS, pero no autoriza al navegador a fijar precios. El resultado ilustrativo no determina si un viaje se puede asignar.

Vectores literales de referencia para la futura aceptación, sin ejecutar pruebas en S02:

| Caso | Material | Total Jopói | Alternativa | Diferencia |
| --- | --- | --- | --- | --- |
| Semilla, 12.000 kg | `216000.00` | `324000.00` | `381000.00` | `57000.00` |
| Semilla, 1,001 kg | `18.02` | `108018.02` | `165018.02` | `57000.00` |
| Semilla, 0,001 kg | `0.02` | `108000.02` | `165000.02` | `57000.00` |
| Snapshot de prueba: dedicado 108.000; 12.000 kg | `216000.00` | `324000.00` | `324000.00` | `0.00` |
| Snapshot de prueba: dedicado 100.000; 12.000 kg | `216000.00` | `324000.00` | `316000.00` | `-8000.00` |

Con la semilla, cambiar la cantidad modifica material y ambos totales, pero la diferencia permanece en ARS 57.000 porque los fletes y la tarifa son fijos. Para demostrar exactamente una mitad de centavo en S17, un snapshot de prueba con material a ARS 5 por tonelada y 1 kg debe producir material `0.01`.

## Recursos y atribuciones

Los tres recursos y su manifiesto están incluidos en `public/demo/chips-v1/`; no se descargan durante la visita. El snapshot incorpora la metadata del manifiesto: ruta local, dimensiones, autor, fuente, licencia, fecha de obtención, cambios, atribución, texto alternativo, leyenda y cantidad de referencia si existe.

| Recurso | Procedencia y uso |
| --- | --- |
| `chips-texture.jpg`, 1280 × 853 | **Woodchips texture**, www.Pixel.la Free Stock Photos. [Ficha de Commons](https://commons.wikimedia.org/wiki/File:Woodchips_texture.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| `chips-pile.jpg`, 1280 × 960 | **Wood chip pile**, Geo Lightspeed7. [Ficha de Commons](https://commons.wikimedia.org/wiki/File:Wood_chip_pile.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). |
| `pesaje-ejemplo.svg`, 1000 × 720 | SVG original del proyecto Jopói, ofrecido bajo [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Bruto 18.000 kg, tara 6.000 kg y neto 12.000 kg. |

Las fotos son las versiones reducidas a 1280 px por Wikimedia Commons, sin retoques locales. Se registran esas modificaciones y se mantiene CC BY-SA 4.0 para el segundo recurso. Su autor no respalda ni está asociado con Jopói. Las licencias de estas imágenes son específicas de los recursos; no se declara aquí una licencia para todo el repositorio.

Las futuras pantallas mostrarán leyendas y atribuciones, incluyendo enlace de fuente y licencia donde corresponda. Las fotos no se presentan como evidencia de procedencia, material sin tratar, calidad ni una operación Jopói. Su asociación al escenario es ilustrativa.

El comprobante muestra “EJEMPLO FICTICIO — SIN VALIDEZ”, sin firmas, sellos, datos fiscales ni empresas reales. `referenceQuantityKg: "12000.000"` identifica su alcance estático: cambiar la cantidad del lote no lo convierte en un pesaje del nuevo valor. El texto de esa limitación está dentro del SVG y en su metadata.

## Verificación y límites

Se ejecutó `npm run typecheck`, se comprobaron formato y dimensiones reales de los recursos y se inspeccionaron visualmente ambas fotos y el SVG rasterizado. La imagen de revisión del SVG se generó solo en `.cache`, fuera de los entregables versionados. No se añadieron dependencias ni se ejecutaron suites, base de datos, aplicación, transacciones de red o despliegue.

S17 comprobará mediante las futuras API los vectores anteriores, cantidades inválidas, precisión excesiva, humedad fuera de rango, snapshots independientes y conservación de precios históricos. S18 verificará explicación económica, fotos, atribuciones y comprobante sin solicitar archivos al visitante. No se crearán pruebas de funciones privadas.

Pendientes explícitos: S03 persistirá snapshots y declaraciones; S06 calculará compatibilidad y aplicará estados; S07 conservará eventos y hashes; S08 expondrá los contratos por API; S12–S15 construirán las pantallas. No hay rutas GPS, cotizaciones actuales, generación de comprobantes reales ni uploads.
