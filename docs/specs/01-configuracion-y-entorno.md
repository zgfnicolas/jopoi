# S01 · Configuración, entorno y presupuesto cero

Área: Backend · base. Tamaño relativo: XS. Dependencias: Ninguna.
Estado: especificada para revisión; sin implementar. Etiqueta prevista al publicar: ready-for-agent.

## Problem Statement

La demo necesita una base técnica reproducible y una forma inequívoca de distinguir configuración incompleta, recursos gratuitos agotados y errores reales, sin contratar servicios ni exponer secretos.

## Solution

Definir los entornos local y publicado, la configuración del servidor y el contrato de errores que utilizarán las demás specs. La aplicación debe poder explicar qué servicio falta sin presentar actividad simulada como disponible.

## User Stories

1. Como responsable del prototipo, quiero preparar el entorno sin contratar planes, para respetar el presupuesto cero.
2. Como desarrollador, quiero conocer qué configuración necesita cada servicio, para reproducir el entorno.
3. Como visitante, quiero distinguir un servicio sin configurar de una acción rechazada, para saber cómo continuar.
4. Como responsable del prototipo, quiero mantener las claves del servidor fuera del navegador, para no conceder acceso a terceros.
5. Como desarrollador, quiero un formato uniforme de errores, para conectar backend y frontend sin interpretaciones diferentes.
6. Como responsable del prototipo, quiero que las cuotas gratuitas detengan el uso antes de generar gastos, para conservar el límite acordado.
7. Como desarrollador, quiero que la preparación técnica existente se revise antes de reutilizarla, para no convertir archivos accidentales en requisitos aprobados.

## Implementation Decisions

- Entorno local con PostgreSQL de desarrollo; publicación objetivo en Vercel Hobby con PostgreSQL en Neon Free. El entorno local no añade un proveedor de producción ni modifica las decisiones del alcance.
- Elegir versiones estables y mutuamente compatibles de Next.js, Node.js, Prisma y el SDK Hedera al implementar. El manifiesto existente no constituye aprobación de versiones ni evidencia de una aplicación terminada.
- Configuración privada: conexión SQL de aplicación, conexión directa para migraciones, secreto de sesión, secreto del trabajo diario, origen público, operador y clave testnet, topic y cuota HCS. Ningún valor secreto se incorpora a respuestas públicas.
- Separar configuración disponible de disponibilidad comprobada. Tener una variable configurada no demuestra conexión SQL ni confirmación de Hedera.
- Las operaciones que requieren PostgreSQL devuelven indisponibilidad si no pueden persistir; no usan memoria del navegador como reemplazo silencioso. La landing puede explicar el prototipo aunque el recorrido no esté disponible.
- Contrato común de error: código estable, mensaje en español, identificador de solicitud no secreto y errores de campo cuando corresponda. La respuesta no incluye stack, conexiones, claves ni detalles internos del proveedor.
- Convención HTTP: 400 entrada mal formada; 401 sesión faltante o vencida en una acción privada; 403 rol representado incompatible o invocación interna no autorizada; 404 recurso inexistente o no accesible; 409 transición, versión o clave idempotente incompatible; 410 trazabilidad vencida cuando pueda determinarse sin exponer datos; 422 regla de negocio; 429 límite alcanzado; 503 dependencia indispensable indisponible.
- No crear cuentas, contratar planes, añadir tarjetas ni desplegar durante la redacción de estas specs. El posterior desarrollo y despliegue requieren una instrucción del usuario.
- Parámetros acordados: sesión 24 horas; tres recorridos por sesión; 100 envíos HCS diarios globales; retención operativa siete días; contactos 90 días; barrido diario. Los detalles temporales se concretan en S10.

### Convenciones de respuesta

| Situación | Código estable propuesto | Resultado |
| --- | --- | --- |
| Entrada inválida | INVALID_INPUT | 400 y errores de campo, sin acción parcial. |
| Sesión ausente o vencida | SESSION_REQUIRED o SESSION_EXPIRED | 401 en acceso privado. |
| Rol incorrecto | WRONG_ROLE | 403, sin transición. |
| Recurso ajeno o inexistente | NOT_FOUND | 404 sin revelar su propietario. |
| Estado, versión o intención incompatibles | STATE_CONFLICT, VERSION_CONFLICT o IDEMPOTENCY_CONFLICT | 409 y recuperación por lectura del estado. |
| Regla incumplida | RULE_VIOLATION | 422 con motivo categorizado, como humedad o peso. |
| Cupo de recorridos agotado | RUN_LIMIT_REACHED | 429, sin crear otro recorrido. |
| Base indispensable indisponible | DATABASE_UNAVAILABLE | 503, sin confirmación de guardado. |

Una acción ya guardada en SQL puede responder correctamente con publicación pausada por cuota o red indisponible. No convertir ese caso en error de guardado ni revertirlo por un HTTP 429 o 503 posterior del proveedor. Los endpoints de lectura pueden devolver estado parcial de red cuando la proyección local sigue disponible.

### Criterios de aceptación

1. La configuración necesaria está inventariada con su finalidad y tratamiento privado, sin valores reales.
2. Una configuración faltante produce un estado recuperable y no una confirmación ficticia.
3. Los entornos y todos los servicios previstos conservan presupuesto cero, sin upgrades automáticos.
4. Las demás specs pueden utilizar el mismo contrato de errores sin introducir respuestas incompatibles.

## Testing Decisions

La creación y ejecución de pruebas se pospone a S17 y S18. Esta spec aporta los escenarios de configuración incompleta y dependencia indisponible; no define pruebas de funciones internas.

## Out of Scope

Contrataciones, elección de otro hosting, cambios de alcance, despliegue, instalación de herramientas o modificación del scaffold durante esta fase documental.

## Further Notes

Derivada de Q6, Q16, Q26–Q29 y ADR 0003. Las decisiones de configuración son propuestas técnicas de esta síntesis, no acciones ya realizadas.
