# S05 · Solicitud real de demo y exportación privada

Área: Backend · contacto. Tamaño relativo: S. Dependencias: S01, S03.
Estado: implementada por autorización posterior del usuario en `feature/s05-contactos-y-exportacion`; tipos, schema, compilación y ayuda CLI comprobados. Comportamiento pendiente de S17/S18.

## Problem Statement

Una persona necesita solicitar conocer el prototipo y el responsable necesita recuperar ese contacto, sin construir agenda, correos automáticos ni un panel público de administración.

## Solution

Definir un formulario real persistido, confirmación veraz y exportación CSV desde una herramienta privada, con retención de 90 días.

## User Stories

1. Como persona interesada, quiero dejar nombre, email y empresa, para solicitar conocer el prototipo.
2. Como persona interesada, quiero añadir un mensaje opcional, para dar contexto sin enviar archivos.
3. Como persona interesada, quiero recibir confirmación solo si se guardó mi solicitud, para confiar en el resultado.
4. Como persona interesada, quiero corregir errores de campo sin perder lo escrito, para completar el formulario.
5. Como responsable del prototipo, quiero exportar contactos de forma privada, para revisar las solicitudes.
6. Como persona interesada, quiero que mis datos no aparezcan en QR ni blockchain, para mantener separado el contacto de la demo ficticia.
7. Como responsable del prototipo, quiero que reintentar una petición no duplique una solicitud, para revisar datos consistentes.
8. Como persona interesada, quiero saber que solicito conocer un prototipo y no reservo una cita, para entender qué ocurrirá después.

## Implementation Decisions

- POST /api/demo-requests recibe nombre, email, empresa, mensaje opcional y clave idempotente. Propone validación acotada: nombre y empresa no vacíos; email sintácticamente válido sin exigir dominio empresarial; mensaje opcional limitado en longitud para no convertirse en almacenamiento de archivos.
- Guardar datos reales por separado de recorridos ficticios. No enviar ningún campo del contacto, incluso el mensaje libre, a HCS ni a la proyección pública de trazabilidad.
- Respuesta de creación con identificador de solicitud no secreto y confirmación. Repetición idempotente con el mismo contenido devuelve la misma solicitud; misma clave con contenido diferente devuelve conflicto.
- Si PostgreSQL no responde, devolver indisponibilidad y permitir reintentar conservando el formulario. No mostrar una confirmación basada solo en el navegador.
- La exportación requiere acceso interno al entorno del servidor o la base y no se publica como endpoint anónimo. Excluir solicitudes vencidas; registrar únicamente conteos y resultado, sin volcar datos personales en logs.
- CSV con encabezados estables: fecha de solicitud, nombre, email, empresa y mensaje. Escapar separadores, comillas y saltos de línea, y neutralizar fórmulas de hoja de cálculo sin ejecutar contenido del visitante.
- Vencimiento 90 días desde el envío; borrado en la siguiente limpieza diaria exitosa, según S10. Exportar no extiende la retención de la base.
- El texto comunica solicitud para conocer el prototipo personal. No afirma reserva, envío de email, contrato, disponibilidad comercial ni plazo de respuesta garantizado.
- Aplicar validación de tamaño y protección de origen. Cualquier control técnico contra abuso debe respetar presupuesto cero y no convertirse en alta de un servicio de pago.

### Campos del contrato

| Campo | Requisito |
| --- | --- |
| requestId | Identificador aleatorio de la solicitud lógica para idempotencia. |
| name | Texto no vacío; nombre de la persona interesada. |
| email | Dirección sintácticamente válida, sin restricción de dominio empresarial. |
| company | Texto no vacío; empresa declarada por la persona. |
| message | Texto opcional, limitado y tratado siempre como contenido del visitante. |

El identificador del contacto no es una URL pública para recuperar datos personales. Los límites de longitud y tamaño serán constantes técnicas documentadas al implementar, sin truncar silenciosamente lo enviado.

### Criterios de aceptación

1. Un envío válido se guarda y puede recuperarse mediante el mecanismo privado de exportación.
2. Un envío fallido no produce confirmación; reintentar no duplica la solicitud.
3. Los datos de contacto no pueden obtenerse mediante QR ni APIs públicas de recorrido.
4. El CSV maneja texto libre de forma segura y omite contactos vencidos.

## Testing Decisions

Persistencia, idempotencia, privacidad y resultado de exportación se documentarán en S17; errores y confirmación del formulario en S18. No se crean tests ni se envían contactos a servicios externos en esta fase.

## Out of Scope

Correos, SMS, WhatsApp, calendario, CRM, panel administrativo público, archivos adjuntos y lanzamiento comercial.

## Further Notes

Q4, Q10, Q19 y Q25, precisadas por Q27. No se ha publicado ninguna solicitud ni se ha creado un servicio externo.

La [documentación de implementación](../contactos-y-exportacion.md) concreta límites, normalización, DTO, idempotencia, vencimiento y exportación. En la planificación se confirmó CSV para Excel en Windows: UTF-8 con BOM y separador `;`. Se reutiliza el modelo SQL sin nuevas migraciones. El formulario visual queda en S13; S10 implementará el borrado diario.
