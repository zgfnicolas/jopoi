# S04 · Sesiones anónimas, propiedad y límite de recorridos

Área: Backend · acceso. Tamaño relativo: S. Dependencias: S03.
Estado: implementada por autorización posterior del usuario en `feature/s04-sesiones-y-aislamiento`; migración aplicada a PostgreSQL local y compilación comprobada. Suites pendientes de S17/S18.

## Problem Statement

La demo debe permitir representar varios roles sin crear cuentas, pero un identificador público o un QR no puede conceder permisos para modificar datos ajenos.

## Solution

Definir una sesión anónima privada de 24 horas y operaciones de inicio, recuperación y reinicio que respeten tres recorridos por sesión y autorización desde el servidor.

## User Stories

1. Como visitante, quiero comenzar sin registrarme, para probar el concepto inmediatamente.
2. Como visitante, quiero retomar mi recorrido desde el mismo navegador, para no empezar de cero al recargar.
3. Como visitante, quiero representar distintos roles, para recorrer la operación completa.
4. Como visitante, quiero iniciar otro recorrido dentro del cupo, para explorar rechazo e incidencia además de recepción conforme.
5. Como visitante, quiero entender cuándo vence mi sesión o se agota el cupo, para saber por qué no puedo modificar.
6. Como visitante, quiero compartir una consulta sin compartir mi acceso, para mostrar la trazabilidad con seguridad.
7. Como responsable del prototipo, quiero que peticiones simultáneas no superen el cupo, para controlar el uso gratuito.
8. Como visitante, quiero que un QR ajeno no habilite acciones sobre ese recorrido, para mantener la separación entre consulta y operación.

## Implementation Decisions

- Token aleatorio de alta entropía en cookie HttpOnly, SameSite y Secure en publicación. Guardar solo su hash en SQL. No incluir el token en URLs, respuestas JSON públicas, QR, logs ni eventos HCS.
- La duración es 24 horas desde crear la sesión, sin renovación deslizante por actividad o reinicio. Una nueva sesión no recupera permiso para modificar recorridos de una sesión anterior.
- API implementada: POST /api/demo/session establece la cookie sin consumir recorridos; GET /api/demo/session recupera estado de sesión y recorrido activo, sin crear datos; POST /api/demo/runs inicia o retoma con intención explícita; POST /api/demo/runs/reset crea otro recorrido. El bootstrap separado y el nuevo inicio explícito después del vencimiento fueron confirmados al planificar S04. No usar GET para mutaciones.
- Inicio e intento repetido con la misma clave idempotente devuelven el mismo recorrido. Recargar no consume un nuevo cupo. Reinicio explícito sí consume uno y conserva la fecha de expiración de la sesión.
- Tres recorridos totales por sesión, incluido el inicial. Contador y creación deben ser atómicos. El cuarto inicio se rechaza con límite visible y sin crear datos parciales.
- El servidor comprueba propietario y vigencia en cada mutación y consulta privada. No basta con ocultar controles. Recurso ajeno e inexistente no revelan datos privados diferentes.
- El cambio de rol no constituye autenticación independiente. Cada comando declara el rol representado y debe corresponder a la acción permitida por S06.
- Proteger mutaciones del navegador frente a solicitudes de otro origen mediante comprobación de origen y protección CSRF equivalente. El acceso público de trazabilidad se implementa como proyección de solo lectura en S11.
- La cuota es por sesión, no una promesa de identificación de persona o dispositivo. Borrar cookies puede crear otra sesión; el límite global de HCS sigue protegiendo el envío.

### Criterios de aceptación

1. Recargar conserva el recorrido; reiniciar crea otro sin ampliar las 24 horas.
2. Dos inicios simultáneos no producen más de tres recorridos.
3. Una sesión no puede consultar datos privados ni modificar datos de otra, incluso con su identificador público.
4. Vencimiento y cupo tienen errores estables y recuperables, sin simular una cuenta empresarial.

## Testing Decisions

La API pública es la frontera principal confirmada por el usuario para aislamiento, expiración y concurrencia, a desarrollar en S17. Cookies, navegación y recuperación visible se cubrirán en S18. No se probarán funciones internas.

## Out of Scope

Registro, login empresarial, recuperación de cuentas, wallets, sincronización entre dispositivos, identificación de personas por navegador y sesiones offline.

## Further Notes

Q3, Q8–Q9, Q17–Q18 y Q24. Conocer la URL de trazabilidad nunca sustituye al token de sesión.

La [documentación de implementación](../sesiones-y-aislamiento.md) concreta contratos, protección de origen/CSRF, recibos de intención y verificaciones realizadas. Las guardas privadas de S04 serán utilizadas por S08; no se adelantaron sus consultas completas ni comandos operativos.
