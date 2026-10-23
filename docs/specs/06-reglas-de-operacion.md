# S06 · Reglas de operación, estados y compatibilidad

Área: Backend · dominio. Tamaño relativo: M. Dependencias: S02, S03, S04.
Estado: dominio puro implementado por autorización posterior del usuario en `feature/s06-reglas-de-operacion`; tipos, schema y compilación comprobados. Integración de persistencia/API pendiente de S07/S08; suites de S17/S18.

## Problem Statement

El recorrido pierde sentido si permite aprobar material fuera de requisito, asignar transporte incompatible o cerrar una recepción con un peso diferente sin dejar constancia.

## Solution

Definir una máquina de estados única para el recorrido y sus reglas observables, conservando la declaración inicial y separando el rol representado de una identidad empresarial real.

## User Stories

1. Como generador representado, quiero editar el lote solo antes de publicarlo, para preservar lo que luego se revisa.
2. Como coordinador representado, quiero aprobar únicamente humedad admisible, para demostrar un control previo al traslado.
3. Como coordinador representado, quiero rechazar con motivo, para conservar por qué no avanzó el lote.
4. Como coordinador representado, quiero saber qué condiciones incumple cada viaje, para elegir uno compatible.
5. Como transportista representado, quiero confirmar retiro solo después de la asignación, para respetar la secuencia.
6. Como comprador representado, quiero registrar un peso recibido distinto, para conservar la discrepancia.
7. Como comprador representado, quiero cerrar con conformidad cuando corresponda, para completar la operación.
8. Como visitante, quiero que un recorrido cerrado no cambie retroactivamente, para entender su historial.
9. Como visitante, quiero reconocer el rol al que corresponde cada acción, para aprender el proceso.

## Implementation Decisions

- Estados del contrato: DRAFT/Borrador, PUBLISHED/Publicado, APPROVED/Aprobado, ASSIGNED/Asignado, PICKED_UP/Retirado, RECEIVED/Recibido, REJECTED/Rechazado e INCIDENT/Incidencia.
- Transiciones permitidas: DRAFT a PUBLISHED por generador; PUBLISHED a APPROVED o REJECTED por coordinador; APPROVED a ASSIGNED por coordinador; ASSIGNED a PICKED_UP por transportista; PICKED_UP a RECEIVED o INCIDENT por comprador. RECEIVED, REJECTED e INCIDENT son terminales.
- Guardar cambios en DRAFT conserva el estado y no crea hito HCS. Publicar puede guardar y publicar la declaración actual en una sola acción atómica, sin una publicación parcial.
- Cantidad y peso recibido positivos y representables con la precisión definida en S03. Humedad entre 0 y 100%, inclusive. No rechazar por humedad fuera de requisito hasta la revisión: el visitante puede publicar un lote de humedad alta para explorar su rechazo.
- Bloquear aprobación cuando la humedad supera el máximo del comprador. Con la semilla v1, 35% permite aprobar y 35,01% no; rechazar siempre requiere un motivo precargado. Al planificar S06 se confirmó que HUMIDITY_ABOVE_LIMIT exige superar ese máximo; el motivo de material sigue disponible con humedad admisible.
- Para asignar, todas las condiciones deben ser compatibles: material, capacidad suficiente, carrocería, ruta y ventana de ejemplo. Se confirmó compatibilidad horaria con solapamiento de duración positiva, sin exigir cubrir toda la ventana; coincidir solo en un extremo no alcanza. No confundir retorno con caja vacía ni movimiento con capacidad disponible.
- El coordinador elige manualmente entre resultados explicados; no hay ranking de IA ni optimización geográfica. Si ningún viaje sirve, no se crea una asignación.
- Recepción conforme exige peso recibido igual al declarado en unidad exacta. Cualquier diferencia obliga a usar incidencia. Puede existir incidencia por material aunque coincidan los pesos; no usar el motivo de peso cuando no hay discrepancia.
- Rechazo e incidencia conservan motivo de un catálogo y los datos disponibles. No añadir campos libres que puedan terminar en el registro público.
- Los roles simulados se validan por comando, pero no equivalen a autenticación de terceros. Propiedad y vigencia de sesión se verifican independientemente.
- No editar eventos, declaración publicada ni resultados de un recorrido terminal. Para otra exploración, consumir un nuevo recorrido según S04.

### Criterios de aceptación

1. El camino conforme respeta todas las transiciones y termina sin permitir otra mutación.
2. El coordinador puede rechazar un lote publicado con humedad incompatible y no puede aprobarlo.
3. Un viaje con una sola condición incumplida no se asigna.
4. Recibir un peso distinto no produce conformidad ni sobrescribe el declarado.
5. Guardar borrador, publicar y actuar desde un rol equivocado tienen resultados diferenciados y previsibles.

## Testing Decisions

S17 cubrirá estas reglas mediante comandos de la API pública, sin importar la organización interna del dominio. S18 cubrirá su comprensión y disponibilidad en cada pantalla.

## Out of Scope

Despachos parciales, consolidación, negociación, disputas, correcciones retroactivas, control físico de calidad, automatización GPS e IA.

## Further Notes

Q7, Q13–Q14, Q23 y Q30. La tolerancia de peso cero solo existe para explicar esta demo; no constituye un estándar industrial.

La [documentación de implementación](../reglas-de-operacion.md) concreta contratos, errores, reglas y límites de integración. S06 no crea rutas de comandos ni escribe estados operativos, eventos o pendientes SQL por separado de S07/S08.
