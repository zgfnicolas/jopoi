# Planes por Fase (`docs/plans/`)

Para cualquier cambio que toque lógica de negocio (`src/domain/`), servicios/persistencia (`src/server/`), esquema de base de datos (`prisma/schema.prisma`) o múltiples superficies de UI, trabajamos con planes divididos en fases revisables.

## Ciclo de trabajo

1. Crear `docs/plans/AAAA-MM-DD_nombre-tarea.md` usando `/plan` o a partir de la plantilla de abajo.
2. Ejecutar **una sola fase por turno**: `"Leé @docs/plans/AAAA-MM-DD_nombre-tarea.md y ejecutá solo la fase 1."`
3. Verificar con `/diff`, `/jopoi-verify` y el subagente correspondiente (`@code-reviewer`, `@security-sql-auditor`, `@ui-a11y-reviewer`).
4. Marcar la fase como `Hecha` y continuar con la siguiente. Al finalizar el trabajo, enlazar el PR o commit en la cabecera del plan.

## Plantilla de plan

```markdown
# Plan: <nombre de la tarea>
Fecha: AAAA-MM-DD · Spec/Invariante: Sxx · PR: # · Estado: En curso

## Objetivo
Qué problema resuelve y criterio global de éxito.

## Contexto que el agente debe leer
- docs/alcance-demo.md
- GLOSSARY.md
- <specs o archivos puntuales>

## Fases

### Fase 1 — <nombre> · Estado: Pendiente
- [ ] Paso concreto 1
- [ ] Paso concreto 2
Criterio de aceptación: `<comando de verificación en verde>`.

### Fase 2 — <nombre> · Estado: Pendiente
- [ ] Paso concreto 1
Criterio de aceptación: `<comando de verificación en verde>`.

## Notas de revisión
- Fase 1: <decisiones tomadas o ajustes detectados>.
```
