# GEMINI.md — Instrucciones exclusivas para Antigravity

- **Planificación previa:** Para cambios que toquen `src/domain/`, `src/server/` o `prisma/schema.prisma`, generá primero un plan con `/plan` (o leé el plan activo en `docs/plans/`) y ejecutá una sola fase por turno esperando aprobación.
- **Protección de contexto:** Nunca leas `JOPOI.md` en la conversación principal (2.4 MB). Si necesitás investigar múltiples archivos de `docs/specs/`, delegá la lectura al subagente integrado `research`.
- **Subagentes de revisión:**
  - Antes de cerrar una tarea de código, delegá la verificación de invariantes en el subagente `code-reviewer`.
  - Si modificaste rutas HTTP, sesiones, consultas SQL o Prisma, delegá una auditoría en `security-sql-auditor`.
  - Si modificaste componentes React o CSS, delegá la verificación visual y de tokens en `ui-a11y-reviewer`.
- **Verificación escalonada:** Usá el skill `/jopoi-verify` para correr las validaciones del repositorio en orden rápido a lento.
