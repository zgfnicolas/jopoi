# S14 · Panel guiado del recorrido completo

Área: Frontend · operación integrada. Tamaño relativo: L. Dependencias: S04, S06, S08, S10, S12.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

El visitante debe representar cuatro participantes y explorar conformidad, rechazo e incidencia sin perder contexto ni confundir las acciones ficticias con firmas empresariales reales.

## Solution

Definir un panel guiado que presente el siguiente paso, permita cambiar de rol representado, conserve el recorrido desde SQL y muestre simultáneamente progreso operativo y estado de red.

## User Stories

1. Como visitante, quiero comenzar o retomar mi recorrido, para no consumir cupo por recargar.
2. Como visitante, quiero saber qué rol estoy representando, para entender quién realiza cada acción.
3. Como generador representado, quiero editar cantidad y humedad y publicar, para mostrar un lote.
4. Como coordinador representado, quiero revisar requisitos y motivos, para aprobar o rechazar con contexto.
5. Como coordinador representado, quiero comparar condiciones de los viajes, para asignar uno compatible.
6. Como transportista representado, quiero confirmar retiro mediante una acción explícita, para continuar la custodia.
7. Como comprador representado, quiero registrar el peso y elegir recepción o incidencia, para cerrar correctamente.
8. Como visitante, quiero ver mensajes pendientes sin bloquear la exploración, para entender las dos capas del sistema.
9. Como visitante, quiero explorar otro resultado dentro del cupo, para conocer las ramas del producto.
10. Como visitante, quiero compartir la trazabilidad y distinguir el QR de las acciones, para no atribuirle permisos.

## Implementation Decisions

- Al entrar, recuperar sesión y recorrido. Si no existe, una intención de inicio crea el primero de forma idempotente. Recargar retoma el existente; reinicio es una acción explícita con cupo restante visible.
- Presentar estado actual, siguiente acción posible, rol representado, datos del lote, evidencia ficticia y resumen económico. No esconder el avance tras un panel técnico de transacciones.
- Mostrar pasos del camino exitoso y una salida clara a rechazo o incidencia. No representar un terminal alternativo como si siguiera pendiente de volver al camino conforme.
- Campos de cantidad y humedad editables solo en borrador, con unidades y precisión compatibles con la API. Guardar no crea mensaje HCS; publicar confirma la declaración actual.
- Revisión muestra máximo del comprador y motivos precargados. No permitir aprobar humedad fuera de requisito; el rechazo cierra ese recorrido y conserva motivo.
- Viajes con explicación de las cinco condiciones. Deshabilitar o rechazar selección incompatible con motivo accesible; si ninguno sirve, explicar cómo los datos del lote llevaron a ese resultado.
- Retiro y recepción tienen acciones separadas. El QR se presenta como consulta; no escanearlo para fingir una segunda firma o autorización empresarial.
- Peso recibido distinto exige incidencia y conserva el declarado. Tolerancia cero visible como regla de la demo. Otros motivos de incidencia provienen del catálogo.
- Durante guardado, impedir doble acción; ante conflicto refrescar estado e informar sin sobrescribir. La API sigue siendo autoridad y la UI no modifica localmente un estado como si hubiera persistido.
- Historial con hito, responsable simulado, fecha de aplicación y publicación. Estado pendiente, error, cuota y verificación diferenciados; reintento manual solo para el propietario y dentro del límite de S10.
- Ante sesión vencida, retirar permisos de escritura y explicar que puede existir consulta pública hasta el vencimiento del recorrido. Nueva sesión no se convierte en propietaria de la anterior.
- Después de un terminal, ofrecer consulta y un nuevo recorrido si queda cupo. No permitir editar, reabrir o resolver disputas.

### Criterios de aceptación

1. Se completan conformidad, rechazo e incidencia sin preparar empresas ni subir archivos.
2. Recargar no consume una exploración adicional y el cuarto recorrido se bloquea.
3. La UI no permite avanzar por una transición o viaje inválidos y maneja el rechazo del servidor.
4. Con Hedera pendiente, el panel conserva y muestra la acción SQL guardada sin llamarla confirmación de red.
5. La recepción mantiene ambos pesos y el historial original.
6. El panel funciona con teclado y en móvil sin perder la acción principal.

## Testing Decisions

S18 cubrirá los recorridos del visitante con navegador real y dos contextos de sesión. S17 verifica reglas y concurrencia de API; no se duplicará cada regla probando un componente aislado.

## Out of Scope

Cuentas empresariales, firmas independientes, escaneo con cámara, carga de archivos, datos comerciales reales, negociación, GPS, resolución de disputas y offline.

## Further Notes

Q3, Q7–Q9, Q11, Q13–Q14, Q18 y Q22–Q30. La experiencia cambia de rol, no de identidad autenticada.
