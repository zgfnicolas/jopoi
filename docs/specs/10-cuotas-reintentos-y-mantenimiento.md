# S10 · Cuotas, recuperación y mantenimiento diario

Área: Backend · coordinación durable. Tamaño relativo: L. Dependencias: S03, S04, S05, S07, S08, S09.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

Los envíos repetidos, tareas simultáneas o pendientes perdidos pueden consumir recursos gratuitos y producir estados engañosos. La capa gratuita tampoco permite asumir revisión horaria ni borrado exacto al segundo.

## Solution

Coordinar publicaciones y limpieza con trabajo persistido, intentos acotados, cuotas atómicas y un barrido diario protegido que retome pendientes sin procesos permanentes.

## User Stories

1. Como visitante, quiero continuar cuando un hito esté pendiente, para explorar el resto de la operación.
2. Como visitante propietario, quiero solicitar un reintento acotado, para intentar recuperar una publicación.
3. Como responsable del prototipo, quiero limitar envíos concurrentes, para respetar el cupo global.
4. Como visitante, quiero conocer cuándo se pausó por cuota, para no confundirlo con una entrega confirmada.
5. Como responsable del prototipo, quiero retomar tareas después de una ejecución interrumpida, para no perder pendientes.
6. Como visitante, quiero que mis datos operativos dejen de consultarse al vencer, para respetar la retención.
7. Como persona interesada, quiero que mi contacto se elimine tras su plazo, para no conservarlo indefinidamente.
8. Como responsable del prototipo, quiero un trabajo diario protegido, para impedir que cualquiera dispare mantenimiento.
9. Como responsable del prototipo, quiero que un error de servicio no active un upgrade, para conservar presupuesto cero.

## Implementation Decisions

- Estado de publicación propuesto: en cola, en envío con lease, resultado incierto, confirmado, error definitivo, pausado por cuota o por configuración. La verificación del mensaje conserva su eje independiente de S09.
- Reconciliar primero toda transacción conocida. Confirmar una respuesta perdida no consume otro intento de envío. No recrear transacciones para resolver resultados inciertos sin evidencia suficiente.
- Tres intentos automáticos totales por evento, incluido el inicial. Propuesta de reintento manual acotado: como máximo un intento de envío adicional por evento, solo del propietario y con una nueva clave idempotente; no restablece el contador automático ni evita cuotas ni borra resultados previos. Si el resultado previo sigue incierto, la acción manual solo reconcilia; no envía a ciegas ni consume por esa lectura el derecho al intento adicional.
- Cada intento externo de envío reserva cupo antes de contactar la red. La cuota global inicia en 100 por día UTC; el conteo conservador de intentos evita superar los mensajes permitidos aun con resultados inciertos. Las lecturas de receipt o mirror no se contabilizan como nuevos mensajes.
- Reserva y contador atómicos y compartidos por todas las instancias de la aplicación, recorridos y topics del mismo día UTC; no devolver una reserva cuando no se sabe si hubo contacto con la red. Una preparación fallida antes de enviar puede liberarla si existe evidencia inequívoca de ausencia de envío.
- Al alcanzar el cupo se conserva el pendiente como pausado hasta el siguiente período. La operación local sigue disponible; la API informa límite y siguiente elegibilidad, sin prometer hora exacta de publicación.
- Intentos durante interacción, reintento manual y barrido automático diario. Q28 sustituye expresamente la propuesta horaria. Sin polling por minuto, programador externo ni ejecución infinita.
- POST /api/demo/runs/{traceId}/events/{eventId}/retry permite reintento privado acotado. GET /api/cron es la única excepción operativa GET con efectos: corresponde a la invocación del programador, protegida mediante secreto de servidor y nunca accesible por enlaces de UI.
- Cada trabajador toma un lease con vencimiento y procesa lotes acotados; una ejecución duplicada o solapada no envía el mismo trabajo simultáneamente. Al interrumpirse, otro trabajador puede recuperar el lease vencido.
- Procesar eventos en orden dentro de un recorrido. Si un hito anterior sigue incierto, no publicar posteriores fuera de orden; el recorrido local puede seguir mostrando su progreso.
- El barrido descarta elegibilidad de recorridos vencidos antes de enviar. Limpia datos operativos siete días desde crear el recorrido y contactos 90 días desde el envío, en la siguiente ejecución diaria exitosa. No conservar payloads privados para aparentar retención.
- Bloquear acceso a datos operativos vencidos desde el vencimiento, aunque la limpieza aún no corra. La caducidad de sesión a 24 horas corta escritura antes de la retención de siete días.
- Contadores y leases vencidos se limpian sin reiniciar cuotas vigentes. Las métricas del mantenimiento son conteos y códigos, no contactos ni tokens.
- Si faltan recursos gratuitos, el trabajo queda explícitamente pendiente o indisponible. No garantizar una publicación en una hora determinada ni borrar mensajes ya enviados a testnet.

### Criterios de aceptación

1. Dos trabajadores o solicitudes concurrentes respetan el límite global y el orden de cada recorrido.
2. Un timeout conserva los identificadores y no produce reenvío ciego.
3. El cuarto intento automático no se ejecuta; la reactivación manual tiene límite verificable.
4. Un cron sin secreto válido no procesa nada; duplicarlo no duplica acciones.
5. Datos vencidos no se consultan y se eliminan en la siguiente limpieza exitosa.
6. La solución no introduce tareas horarias, Redis ni un servicio pago.

## Testing Decisions

S17 cubrirá cuotas, leases, reintentos, expiración y cron mediante API y reloj controlado. No se verifican internamente funciones de bloqueo; se observan límites, estados y mensajes de la frontera externa.

## Out of Scope

SLA de entrega, revisión horaria, scheduler externo, colas de pago, reintentos ilimitados, recuperación comercial de incidentes y modificación retroactiva de eventos.

## Further Notes

Q18, Q22, Q24–Q25 y Q28. El límite manual y el día UTC precisan el contrato técnico para revisión; no alteran la política de gasto cero ni amplían las tres exploraciones por sesión.
