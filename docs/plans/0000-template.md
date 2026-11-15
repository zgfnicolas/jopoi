# Plan: [Nombre de la tarea o funcionalidad]

**Fecha:** AAAA-MM-DD  
**Issue:** #XX  
**PR:** #YY  
**Estado:** Propuesto | En curso | Completado  

---

## 1. Objetivo
Descripción concisa de qué cambio o funcionalidad se implementa y qué valor aporta (vincular a historia de usuario `HU-xx` si aplica).

---

## 2. Contexto que el agente debe leer obligatoriamente
- `docs/business_rules.md` (especificar reglas relevantes, ej. RN-01, RN-04)
- `docs/roles.md`
- `docs/sad.md`
- `prisma/schema.prisma`
- (Archivos de código fuente específicos)

---

## 3. Fases de ejecución

### Fase 1 — [Nombre de la fase, ej. Modelado y Contratos] · Estado: Pendiente
- [ ] Tarea 1 (ej. Definir esquema Zod en `src/contracts/`)
- [ ] Tarea 2 (ej. Agregar migración en Prisma si corresponde)
**Criterio de salida:** Compilación sin errores y tipos validados (`npm run typecheck`).

---

### Fase 2 — [Nombre de la fase, ej. Servicio y Lógica de Dominio] · Estado: Pendiente
- [ ] Tarea 1 (ej. Implementar función en `src/domain/`)
- [ ] Tarea 2 (ej. Escribir pruebas unitarias que cubran casos borde y reglas)
**Criterio de salida:** Pruebas unitarias en verde (`npm test`).

---

### Fase 3 — [Nombre de la fase, ej. Endpoint y Transporte] · Estado: Pendiente
- [ ] Tarea 1 (ej. Conectar Server Action o Route Handler)
- [ ] Tarea 2 (ej. Validar respuestas RFC-7807 y cabeceras de seguridad)
**Criterio de salida:** Pruebas de integración en verde (`npm run test:api`).

---

## 4. Notas de revisión humana
- *Registro de observaciones, correcciones intermedias y reglas incorporadas a `AGENTS.md` tras cada fase.*
