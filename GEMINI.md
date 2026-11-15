# Instrucciones Específicas para Antigravity CLI (agy)

Este archivo contiene directivas operativas exclusivas para el motor y subagentes de Antigravity. Las instrucciones generales del proyecto residen en [`AGENTS.md`](AGENTS.md).

---

## 1. Planificación supervisada y trabajo por fases
- **Uso obligatorio de `/plan`:** Para cualquier cambio que involucre lógica de negocio (`src/domain/`), contratos (`src/contracts/`) o persistencia (`prisma/`), generá primero un plan de implementación detallado con `/plan` y esperá la aprobación explícita del usuario antes de modificar archivos.
- **Ejecución atómica por fases:** Si existe un plan activo en `docs/plans/`, ejecutá **únicamente la fase indicada** por el usuario y detenete inmediatamente al completarla para revisión humana. Nunca encadenes múltiples fases sin confirmación intermedia.

## 2. Delegación en subagentes
- **Revisión de código:** Antes de dar por finalizada una tarea compleja o proponer un commit/PR, delegá la auditoría en el subagente `@code-reviewer` para verificar que no haya violaciones a `docs/business_rules.md` ni a la arquitectura en 4 capas.
- **Auditoría SRE:** Para comprobar indicadores de confiabilidad y runbooks, invocá al subagente `@observability-auditor`.
- **Exploración profunda:** Para analizar múltiples archivos o investigar dependencias sin sobrecargar el contexto de la conversación principal, delegá la búsqueda en el subagente integrado `research`.

## 3. Presupuesto cero e invariantes del proyecto
- Nunca propongas ni utilices bibliotecas o integraciones SaaS que requieran planes de pago, tarjetas de crédito o suscripciones comerciales.
- Respetá estrictamente los límites de la cuota diaria global de Hedera HCS (100 mensajes) y la retención de datos descripta en `docs/prd.md`.
- Si las directivas de un ticket o plan contradicen las reglas de negocio (`RN-01` a `RN-15`), **detenete y solicitá aclaración al usuario** antes de escribir código.
