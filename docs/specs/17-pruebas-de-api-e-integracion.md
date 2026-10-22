# S17 · Pruebas de API pública e integración

Área: Pruebas · backend integrado. Tamaño relativo: L. Dependencias: S01–S11, S16.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

Las reglas, el aislamiento y la publicación durable pueden parecer correctos en pantalla y fallar ante concurrencia, expiración o resultados de red inciertos. Verificar funciones internas no demuestra que el contrato público funcione.

## Solution

Crear al final una suite de comportamiento mediante la API pública, con PostgreSQL de prueba y control de la frontera externa de Hedera, siguiendo los límites ya confirmados por el usuario.

## User Stories

1. Como responsable del prototipo, quiero evidencia de aislamiento, para no compartir datos privados entre visitantes.
2. Como responsable del prototipo, quiero verificar las tres ramas del recorrido, para detectar transiciones incompletas.
3. Como responsable del prototipo, quiero provocar respuestas inciertas de red, para comprobar que no se inventan confirmaciones.
4. Como responsable del prototipo, quiero verificar concurrencia e idempotencia, para evitar doble acción y exceso de cuota.
5. Como responsable del prototipo, quiero comprobar vencimientos sin esperar días reales, para verificar la retención.
6. Como responsable del prototipo, quiero revisar los DTO públicos, para evitar filtración de contactos y credenciales.
7. Como desarrollador, quiero pruebas resistentes a una reorganización interna, para mejorar el código sin rehacer la suite.
8. Como responsable del prototipo, quiero separar evidencia simulada y testnet real, para saber qué integración quedó comprobada.
9. Como responsable del prototipo, quiero que la suite no use recursos pagos ni borre datos vigentes, para respetar el alcance.
10. Como responsable del prototipo, quiero casos esperados independientes de la implementación, para evitar tests que pasan por construcción.

## Implementation Decisions

- Esta es la primera spec que crea pruebas de aplicación. S01–S16 definen comportamiento y preparación; no se introducen suites antes de esta etapa.
- Frontera principal confirmada: solicitudes y respuestas de la API pública y privada de la demo. No probar métodos privados, nombres de tablas, estructura de componentes ni detalles de ORM.
- Usar PostgreSQL real de prueba con estado aislado y datos sintéticos. Preparar y limpiar fixtures no autoriza tocar la base de contactos reales ni recursos de publicación.
- Controlar únicamente fronteras externas: reloj, aleatoriedad y proveedor Hedera/mirror. Un doble del proveedor debe representar confirmación, rechazo definitivo, timeout, resultado desconocido, demora de mirror y mensaje alterado.
- Verificar efectos mediante otra solicitud pública o la salida autorizada de exportación, no afirmando que se llamó un colaborador interno.
- Elegir herramientas gratuitas compatibles al implementar. No existe suite funcional previa que deba copiarse; dependencias instaladas durante la preparación accidental no son por sí mismas una decisión aprobada de testing.
- Reloj de prueba y fallos se configuran en el entorno de ejecución de la suite, sin añadir endpoints públicos para cambiar fechas o forzar resultados.
- No usar la misma función de cálculo o canonicalización para producir el esperado y verificarlo. Tomar importes literales trabajados de S02 y vectores canónicos independientes.
- Registrar qué casos usan proveedor controlado. Ningún resultado con doble de red satisface la comprobación real de testnet de S18.

### Criterios de aceptación

1. La suite verifica los contratos de S01–S11 sin importar funciones internas del producto.
2. Cada caso tiene resultado esperado explícito, datos independientes y limpieza aislada.
3. El resultado distingue casos aprobados, fallidos y bloqueados; no omite silenciosamente dependencias faltantes.
4. Los escenarios concurrentes demuestran límites y ausencia de duplicados observables.
5. La suite deja evidencias reproducibles sin exponer secretos ni datos personales reales.

## Testing Decisions

Confirmado por el usuario: API pública como frontera principal y navegador como complemento en S18. Un buen test describe comportamiento, observa el contrato externo y falla por una diferencia relevante para el visitante o responsable; no replica la implementación ni exige una organización interna concreta.

### Matriz de casos

| Caso | Escenario | Resultado esperado |
| --- | --- | --- |
| API-01 | Sesión nueva, recuperación y recarga | La primera exploración se conserva; recargar no consume otro cupo. |
| API-02 | Límite concurrente de recorridos | Incluso con solicitudes simultáneas se crean como máximo tres por sesión. |
| API-03 | Aislamiento y origen | La sesión B no obtiene datos privados ni modifica el recorrido A; solicitudes de otro origen se rechazan. |
| API-04 | Expiración de sesión y consulta | A las 24 h se rechaza escritura; la consulta pública puede seguir vigente hasta su propio vencimiento. |
| API-05 | Declaración inválida | Cantidad o peso no positivos, humedad fuera de 0–100 y precisión no representable no avanzan el estado. |
| API-06 | Borrador y publicación | Guardar no crea hitos; publicar conserva la declaración y crea un único evento lógico. |
| API-07 | Límite de humedad | Con requisito 35%, 35 permite aprobar y 35,01 bloquea; rechazo conserva motivo. |
| API-08 | Transporte | Una condición incompatible bloquea asignación; cantidad excesiva puede dejar ambos viajes no disponibles. |
| API-09 | Recepción conforme | Peso recibido exactamente igual permite cierre conforme y conserva la declaración. |
| API-10 | Incidencia | Peso diferente exige incidencia; motivo de material puede existir con pesos iguales. |
| API-11 | Roles y terminales | Roles incorrectos y mutaciones después de recibido, rechazado o incidencia no cambian el historial. |
| API-12 | Idempotencia y versión | Misma clave e intención no duplican; clave reutilizada con otros datos o versión vieja dan conflicto. |
| API-13 | Persistencia y evidencia | Toda acción guardada expone su evento esperado; falla SQL sin confirmar una acción inexistente. |
| API-14 | Hash reproducible | Orden de claves no altera el hash canónico; alterar un dato sí; metadatos de envío no reescriben el payload. |
| API-15 | Envío incierto | Una respuesta perdida conserva transactionId; recargar o revisar no crea otra transacción a ciegas. |
| API-16 | Confirmación y mirror | Receipt confirmado con mirror demorado sigue sin afirmar coincidencia; mensaje alterado produce discrepancia. |
| API-17 | Cuota global concurrente | La reserva impide superar el límite; una acción SQL puede quedar guardada con publicación pausada. |
| API-18 | Reintentos | Tres intentos automáticos y una reactivación manual acotada; lecturas de resultado no cuentan como mensajes nuevos. |
| API-19 | Lease y orden | Trabajadores solapados no envían simultáneamente el mismo evento ni adelantan hitos de un recorrido. |
| API-20 | Cron protegido y recuperación | Sin secreto válido no hay trabajo; un lease abandonado puede recuperarse y una ejecución duplicada es segura. |
| API-21 | Retención | A los siete días no se sirve el recorrido; limpieza diaria elimina vencidos y contactos de 90 días sin tocar vigentes. |
| API-22 | Contacto y CSV | Éxito persistido, reintento idempotente, datos inválidos, texto con comillas/saltos y neutralización de fórmulas. |
| API-23 | Privacidad y lectura pública | DTO, errores y verificación no contienen contactos, tokens, claves, bytes firmados ni atributos internos. |
| API-24 | Cálculo ilustrativo | Con 12.000 kg se obtienen 216.000 de material, 324.000 total, 381.000 alternativa y 57.000 diferencia. |
| API-25 | Red reiniciada o suspendida | No se cambia silenciosamente topic ni red; se informa evidencia actualmente no disponible sin reescribir historia. |
| API-26 | Escaneo y consulta | Consultar el QR o verificar un evento no consume recorridos ni publica mensajes. |

## Out of Scope

Tests de funciones privadas, cobertura porcentual como sustituto de comportamiento, snapshots derivados automáticamente, benchmarks comerciales, tráfico masivo a testnet y pruebas contra datos personales reales.

## Further Notes

Ordenada al final por instrucción explícita del usuario. La ejecución se realizará después de autorizar implementación; esta entrega contiene únicamente la spec.
