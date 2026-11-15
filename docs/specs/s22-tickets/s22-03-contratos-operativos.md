# S22-03 · Expansión de contratos operativos

Fecha: 2026-10-30. Alcance: ticket 03, decisiones D01/D06/D16 y partes aplicables de S22-10/S22-11. Se incorporan contratos paralelos para poder migrar por lotes sin cambiar el JSON existente.

## Operación discriminada

`OperationSnapshot`, en `src/shared/operation-snapshot.ts`, conserva los ocho campos JSON de `OperationData`. Todos son readonly. Cada estado exige la combinación de campos que le corresponde:

| Estado | Comprador/viaje | Peso recibido | Motivo |
| --- | --- | --- | --- |
| DRAFT, PUBLISHED, APPROVED | Ambos null | null | Ambos null |
| ASSIGNED, PICKED_UP | Ambos obligatorios | null | Ambos null |
| RECEIVED | Ambos obligatorios | Obligatorio | Ambos null |
| REJECTED | Ambos null | null | Rechazo obligatorio; incidencia null |
| INCIDENT | Ambos obligatorios | Obligatorio | Incidencia obligatoria; rechazo null |

El discriminante permite acceder a los datos requeridos sin `!` ni casts. Los tipos hacen explícita la estructura; la sintaxis decimal, las relaciones con catálogos y las reglas numéricas necesitan validación runtime. No se agregan IDs, versiones SQL, fechas, credenciales ni estado HCS a esta representación de dominio.

## Frontera de reconstrucción

La función exportada `reconstructOperationSnapshot(input: unknown, scenario: unknown)` es la frontera pública del módulo de dominio. No es un endpoint HTTP nuevo. Valida el escenario y sus catálogos, luego la operación mediante una unión discriminada estricta de Zod, y finalmente la coherencia entre ambos.

Se comprueba:

- Campos requeridos, null explícitos y ausencia de atributos extra, sin rellenar valores faltantes.
- Cantidades canónicas positivas, dentro del rango int64 en gramos; humedad canónica entre 0 y 100%. Se acota la longitud antes de convertir la cantidad a bigint.
- Identificadores inequívocos de viajes y motivos dentro del escenario.
- Comprador asignado igual al comprador del escenario y viaje existente y compatible con material, capacidad, carrocería, ruta y ventana de retiro.
- Humedad aprobada dentro del máximo del comprador en APPROVED y estados posteriores al transporte.
- Recepción conforme con peso exactamente igual al declarado, sin floating point.
- Rechazo con motivo de su catálogo; HUMIDITY_ABOVE_LIMIT exige superar el límite.
- Incidencia con motivo de su catálogo; WEIGHT_MISMATCH exige diferencia de peso. MATERIAL_ISSUE permite pesos iguales.

Un fallo devuelve un DomainResult con INVALID_INPUT y un mensaje propio en operation o scenario. No serializa el input ni expone errores internos de Zod. Una reconstrucción correcta devuelve un objeto congelado con los campos originales: no corrige silenciosamente pesos, no elige un viaje alternativo y no inventa motivos.

El contexto provisto debe ser el snapshot del mismo agregado, seleccionado por el adaptador autorizado. Esta función no autoriza sesiones, no compara una versión SQL externa ni prueba que haya ocurrido una transición, publicación o consenso HCS. El adaptador SQL del ticket 04 debe conservar esas comprobaciones y traducir corrupción persistida al error interno correspondiente.

## Compatibilidad temporal

La entrada acepta el JSON anterior válido, con su precisión y null explícitos. `toLegacyOperationData` adapta el resultado al contrato anterior mediante asignabilidad estructural; devuelve el mismo valor sin casts, transformaciones, campos extra ni defaults. El contrato nuevo no depende de la interfaz anterior para definir sus campos base, lo que permite retirar esa interfaz sin crear un alias circular.

Las pruebas recorren todos los estados y comparan el JSON canónico antes/después, además de pasarlo por el schema anterior real. También atraviesan el motor de decisiones vigente en guardado, conformidad, rechazo e incidencia. No se regeneran hashes, payloads HCS ni recibos históricos como parte de esta expansión.

Los consumidores de producción siguen usando `OperationData`, `operationDataSchema` y la reconstrucción de almacenamiento vigente. Por eso esta entrega no acredita aún el rechazo HTTP de toda corrupción semántica de SQL: esa migración pertenece al ticket 04. La fixture inválida de este ticket se rechaza invocando la función exportada de reconstrucción, sin espiar sus funciones internas.

## Intención discriminada

`OperationIntent`, en `src/shared/operation-intents.ts`, agrega variantes readonly por kind:

- bootstrap, start y reset tienen su ruta fija y body capturado.
- command requiere traceId, action y expectedVersion, además de path/body.
- retry requiere traceId y eventId, además de path/body.

Los metadatos dejan de ser un conjunto de opcionales independientes. El body permanece como la cadena original para que el futuro consumidor reintente la misma clave y contenido, sin regenerarlos al recibir una respuesta incierta. Este tipo describe una intención interna; no afirma haber validado un JSON arbitrario dentro de body ni sustituye las validaciones HTTP y de dominio existentes. El ticket 05 migrará el panel, sus estados de carga/conflicto/incertidumbre y la construcción de intenciones.

## Secuencia de adopción

1. **Expandir — ticket 03:** tipos nuevos, reconstrucción semántica pública, adaptador saliente y pruebas, junto a la forma anterior.
2. **Migrar consumidores — tickets 04/05:** almacenamiento, comandos, eventos y recibos adoptan el contrato operativo; el panel adopta la intención discriminada. Los adaptadores conservan el contrato HTTP y el JSON válidos. El 06 completa el lote de CLI/configuración/arneses.
3. **Retirar — ticket 07:** eliminar la forma mecánica anterior y sus adaptadores cuando ya no tengan consumidores; exigir las tres opciones estrictas sin tolerancia. No retirar adaptadores HTTP públicos de compatibilidad por este cambio de tipos.

## Verificación

`npm run test:domain` ejecuta las pruebas de reconstrucción con el test runner nativo de Node y tsx, sin DB, reloj ni red. Queda incluido explícitamente en `quality:check` antes de CLI/UI/API. `npm test` sigue ejecutando solamente Vitest HTTP.

`tests/domain/operation-contracts.types.ts` comprueba durante typecheck que los datos requeridos no vuelvan a ser opcionales/nulos y que los discriminantes permitan narrowing. No usa @ts-expect-error, @ts-ignore, casts ni non-null assertions. Los archivos nuevos están incluidos tanto en el perfil vigente como en el completo; no se modifica ningún include/exclude.

Las pruebas de dominio comprueban la nueva frontera exportada. La regresión HTTP con PostgreSQL descartable y ledger controlado verifica que comandos, lecturas y recibos vigentes continúen funcionando. No se envían transacciones reales a Hedera.

Resultados locales del 2026-10-30, Node 24.22.1:

| Comprobación | Resultado |
| --- | --- |
| `npm run quality:check` | Puerta completa aprobada, código de salida 0 |
| Prisma | Generación y validación correctas |
| Tipos vigentes y lint | Correctos; 193 archivos analizados por Biome |
| Perfil completo | 106 pendientes globales; cero en los cinco archivos nuevos de este lote |
| Contratos de tipos | Comprobados por TypeScript sin supresiones |
| Dominio | 39/39 aprobadas, incluida la reconstrucción inválida por la función pública exportada |
| HTTP | 43/43 aprobadas en 5 archivos, incluidos recibos, concurrencia, rollback y vector JCS histórico |
| Bloqueo del gate / seguridad / CLI / tokens UI | 2/2, 7/7, 19/19 y 2/2 aprobadas, respectivamente |
| Build | Correcto; conserva el aviso de metadataBase del entorno con origen sintético |
| Formato | Cinco archivos nuevos comprobados sin modificaciones |

El informe estricto está en `.cache/quality/strict-report.json` y la regresión HTTP en `.cache/api-tests/results/report.json`. Se cerró PostgreSQL descartable y se restauró `next-env.d.ts`. No se agregaron dependencias, migraciones, casts ni supresiones. La verificación de dominio no necesita navegador y los consumidores de UI no cambiaron en este ticket.

Estos resultados acreditan la expansión local del contrato. La adopción SQL/recibos del 04, la adopción del panel del 05, el cierre estricto del 07 y la ejecución de CI remoto siguen pendientes. No se declara cumplido globalmente S22-10/S22-11 por esta entrega parcial.
