# S08 · API privada del recorrido y comandos idempotentes

Área: Backend · interfaz operativa. Tamaño relativo: M. Dependencias: S04, S06, S07.
Estado: implementada por instrucción posterior del usuario; verificaciones de preparación documentadas en [API del recorrido](../api-del-recorrido.md). Pruebas de comportamiento pendientes de S17/S18.

## Problem Statement

El frontend necesita una interfaz que permita completar el recorrido sin saltarse reglas, duplicar acciones ni usar un QR como permiso de escritura.

## Solution

Exponer una API operativa bajo sesión anónima que recupere el recorrido, acepte comandos versionados y devuelva estado local y de red por separado.

## User Stories

1. Como visitante, quiero recuperar el estado vigente, para continuar después de recargar.
2. Como generador representado, quiero guardar y publicar mi declaración, para iniciar el recorrido.
3. Como coordinador representado, quiero revisar y asignar mediante acciones explícitas, para conservar responsabilidad representada.
4. Como transportista representado, quiero confirmar retiro, para avanzar la custodia.
5. Como comprador representado, quiero registrar conformidad o incidencia, para cerrar con evidencia.
6. Como visitante, quiero que un doble clic no repita la acción, para mantener un único historial.
7. Como visitante, quiero recibir un conflicto claro si otra pestaña avanzó, para no sobrescribir datos.
8. Como visitante, quiero poder seguir la demo cuando la red esté pendiente, para separar operación y publicación.
9. Como responsable del prototipo, quiero que acciones ajenas no se ejecuten aunque conozcan el identificador público, para conservar aislamiento.

## Implementation Decisions

- GET /api/demo/runs/current devuelve el recorrido activo del propietario, su versión, escenario, reglas de compatibilidad, resumen económico y publicaciones; no crea datos.
- GET /api/demo/runs/{traceId} es consulta privada del propietario. La proyección compartible se define por separado en S11 y no reutiliza automáticamente este DTO.
- POST /api/demo/runs/{traceId}/commands recibe requestId único, expectedVersion, rol representado, acción y datos permitidos para esa acción.
- Acciones v1: save y publish reciben quantityKg y humidityPercent; approve no añade datos; reject recibe reasonCode precargado; assign recibe tripId; pickup no añade datos; receive recibe receivedKg; incident recibe receivedKg y reasonCode.
- Los decimales del contrato se transmiten como cadenas con punto decimal; la respuesta incluye una representación normalizada. Validar forma y precisión antes de ejecutar reglas de negocio.
- Autorizar sesión y propiedad antes de devolver datos. Validar rol y transición, luego persistir estado/evento/pendiente de forma atómica. La llamada de red no condiciona el commit SQL de una acción válida.
- Repetir el mismo requestId con la misma intención devuelve el resultado lógico ya registrado y la versión vigente. Reutilizarlo con otra intención devuelve 409. Una solicitud nueva con expectedVersion desactualizada también devuelve 409.
- La respuesta distingue si la acción se guardó, estado operativo actual, evento creado si corresponde y estado de publicación. No usar un único booleano success para significar guardado SQL y consenso.
- Mapear errores con S01; una transición inválida o cuota no cambia el historial. El cliente puede refrescar el estado ante conflicto antes de proponer otra acción.
- En esta spec la operación solo crea el pendiente de red. S09 aporta el adaptador y S10 conecta intentos durante interacción, manuales y diarios.
- Limitar el tamaño de entrada y aceptar solo atributos definidos. No confiar en nombres de empresa, importes, estados o rol autenticado enviados por el navegador.
- Contrato concretado y confirmado al planificar: lecturas con `{ session, run }`, `200` con `run: null` cuando aún no existe; historial completo con payload/hash y publicación. Entrada plana estricta de hasta 4 KiB. POST responde `200` con `{ saved: true, traceId, replayed, applied, current, event, publication }`; saved solo afirma persistencia SQL.
- Conservar las decisiones de S07: decimales normalizados equivalentes tienen la misma intención y expectedVersion integra su hash. Reutilizar la ejecución transaccional existente, sin migraciones ni dependencias adicionales.

### Atributos comunes y resultado

| Atributo | Contrato propuesto |
| --- | --- |
| requestId | Identificador único de la intención; repetirlo no repite la acción. |
| expectedVersion | Versión entera vigente obtenida por lectura previa. |
| role | generator, coordinator, carrier o buyer; siempre un rol simulado. |
| action | Una de las ocho acciones descritas, con solo sus datos permitidos. |
| quantityKg y receivedKg | Cadenas decimales positivas, hasta tres decimales; salida normalizada a esa precisión. |
| humidityPercent | Cadena decimal entre 0 y 100%, hasta dos decimales. |
| traceId | Localizador público del recorrido; no autoriza escritura. |
| state y version | Estado operativo y versión actuales después del resultado. |
| event | Hito original de la acción cuando corresponde; guardar borrador no crea uno. |
| publication | Estado de envío y verificación correspondiente, sin afirmar consenso por el guardado SQL. |

Los nombres técnicos no cambian las etiquetas en español de la interfaz. La respuesta de recuperación incluye vigencia de sesión y recorridos restantes solo para su propietario. Una respuesta idempotente diferencia el hito original del estado vigente cuando el recorrido ya avanzó.

### Criterios de aceptación

1. La API permite realizar las tres ramas acordadas usando el mismo contrato de comandos.
2. Un comando no autorizado, mal formado o incompatible no produce efectos parciales.
3. Dos comandos concurrentes con la misma versión no pisan datos; uno avanza y el otro recibe conflicto o resultado idempotente.
4. Una acción SQL válida permanece guardada aunque Hedera no esté configurada o disponible.

## Testing Decisions

Esta API es la frontera principal confirmada por el usuario para S17: se observa mediante solicitudes y respuestas, no importando funciones internas. S18 utiliza la misma API a través del navegador.

## Out of Scope

Mutaciones públicas, clientes externos comerciales, endpoints de facturación, autenticación empresarial, envío HCS, frontend y despliegue. La restricción histórica de no implementar durante la fase documental fue superada por la instrucción posterior de implementar S08.

## Further Notes

Q3, Q8, Q13, Q20–Q24. Las rutas y nombres de campos son propuestas de contrato de esta síntesis; no prescriben archivos del repositorio.
