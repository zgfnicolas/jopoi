---
trigger: glob
globs: "src/app/api/**/*.ts, src/contracts/**/*.ts"
description: "Convenciones para endpoints HTTP, Server Actions y contratos de validación Zod."
---

# Reglas para Contratos y Endpoints de API

- **Validación de entradas:** Todo endpoint HTTP y Server Action debe validar estrictamente los parámetros recibidos mediante un esquema discriminado de `src/contracts/` antes de delegar a la capa de dominio o persistencia.
- **Formato de errores estándar:** Todas las respuestas de error deben estructurarse bajo el estándar **RFC-7807 / RFC-9457 (Problem Details)** incluyendo `type`, `title`, `status`, `detail` e `instance`.
- **Códigos de estado semánticos:**
  - `400 Bad Request`: Parámetros inválidos, tipos incorrectos o violaciones de formato.
  - `401 Unauthorized`: Ausencia o token inválido en la cookie de sesión.
  - `403 Forbidden`: Intento de operar con un rol simulado no autorizado o sobre un recorrido de otra sesión (`docs/roles.md`).
  - `404 Not Found`: Recorrido o recurso inexistente.
  - `409 Conflict`: Conflicto de concurrencia (`ETag` desactualizado) o intento de mutar un estado terminal (`RN-10`).
  - `429 Too Many Requests`: Exceso en el límite de tasa de admisión o cuota agotada.
- **Idempotencia y concurrencia:**
  - Toda mutación que modifique el estado de un lote debe requerir y validar `Idempotency-Key` o `X-Request-Id`.
  - Las consultas operativas deben emitir cabeceras `ETag` basadas en la versión del recorrido (`version`), y las mutaciones validar `If-Match`.
- **Desacoplamiento:** Las rutas de transporte nunca importan el cliente de base de datos (`prisma`) directamente; siempre interactúan a través de los servicios de dominio o persistencia.
