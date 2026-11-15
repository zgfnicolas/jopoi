# Roles y Permisos

Este documento especifica los roles representados en **Jopói**, su mecanismo de asignación, la matriz de permisos sobre las acciones del sistema y las reglas especiales de seguridad e idempotencia.

---

## 1. Definición de roles

En el prototipo actual, los roles operativos del circuito logístico se representan dentro de una **sesión anónima efímera**. Esto permite a un único evaluador experimentar la cadena completa sin fricción de autenticación previa:

| Rol | Quién es | Cómo obtiene el rol |
| :--- | :--- | :--- |
| **Generador** | Productor agroforestal o aserradero que genera los chips | Simulado activamente al inicio del recorrido guiado. |
| **Coordinador** | Operador logístico de Jopói que conecta oferta, demanda y transporte | Simulado en la etapa de revisión de lote y selección de flete. |
| **Transportista** | Conductor o empresa de transporte de retorno asignada | Simulado al momento de retirar la carga en la planta de origen. |
| **Comprador** | Planta industrial que recepciona y pesa el material en destino | Simulado en la etapa final de recepción física y pesaje. |
| **Visitante / Auditor** | Tercero que consulta el historial público mediante código QR o URL | Acceso público sin sesión ni registro requerido. |
| **Solicitante de Demo** | Interesado comercial que solicita contacto institucional | Usuario anónimo que completa el formulario de solicitud. |
| **Administrador de Sistema** | Operador técnico que ejecuta mantenimiento, barridos y healthchecks | Acceso por CLI local o mediante tareas automáticas seguras. |

---

## 2. Matriz de permisos

| Acción del sistema | Generador | Coordinador | Transportista | Comprador | Visitante | Solicitante | Administrador |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Modificar borrador de lote (`SAVE`) | ✓ | | | | | | |
| Publicar lote (`PUBLISH`) | ✓ | | | | | | |
| Aprobar lote publicado (`APPROVE`) | | ✓ | | | | | |
| Rechazar lote publicado (`REJECT`) | | ✓ | | | | | |
| Asignar viaje de transporte (`ASSIGN`) | | ✓ | | | | |
| Confirmar retiro de carga (`PICKUP`) | | | ✓ | | | | |
| Confirmar recepción conforme (`RECEIVE`) | | | | ✓ | | | |
| Reportar incidencia en destino (`INCIDENT`) | | | | ✓ | | | |
| Reintentar publicación HCS (`RETRY_PUBLICATION`) | ✓ | ✓ | ✓ | ✓ | | | ✓ |
| Consultar trazabilidad pública y QR | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Enviar solicitud de contacto comercial | | | | | ✓ | ✓ | |
| Disparar barrido diario y limpieza | | | | | | | ✓ |
| Consultar diagnósticos y métricas RUM | | | | | | | ✓ |

---

## 3. Reglas especiales de autorización y sesión

1. **Aislamiento estricto por sesión anónima:**
   - Cada visitante recibe una cookie de sesión criptográfica (`__Host-jopoi_session` o fallback seguro) vinculada a un registro único `DemoSession`.
   - Las mutaciones (`SAVE`, `PUBLISH`, `APPROVE`, `ASSIGN`, `PICKUP`, `RECEIVE`, `INCIDENT`) solo pueden ejecutarse sobre recorridos (`DemoRun`) que pertenezcan a la sesión del usuario.
   - Cualquier intento de acceder o mutar el recorrido de otra sesión devuelve un error de autorización (`403 Forbidden` / `404 Not Found`).

2. **Simulación de rol con validación de comando:**
   - La interfaz permite alternar de rol para completar el flujo, pero el backend valida que la acción corresponda exactamente al rol simulado declarado en el comando (por ejemplo, el comando `APPROVE` solo se admite con `simulatedRole: COORDINATOR`).

3. **Inmutabilidad de estados terminales:**
   - Una vez que un recorrido alcanza un estado terminal (`RECEIVED`, `REJECTED` o `INCIDENT`), ninguna acción ni rol puede volver a mutar la operación.
   - Para evaluar otro camino, el visitante debe iniciar un nuevo recorrido (sujeto al cupo máximo de 3 por sesión).

4. **Consulta pública de solo lectura:**
   - El acceso mediante código QR o identificador público (`traceId`) es estrictamente de solo lectura. Conocer el enlace de trazabilidad no concede permisos para retirar o recepcionar el lote.
   - Los datos privados de contacto (`DemoRequest`) nunca se exponen en las vistas públicas de trazabilidad ni se asocian al identificador del recorrido.
