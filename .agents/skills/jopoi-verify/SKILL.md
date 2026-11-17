---
name: jopoi-verify
description: Ejecuta la cadena de verificación local de Jopói (tipos, Prisma, tokens UI, tests de CLI, tests de API y chequeo de entrega). Usar antes de dar una tarea por terminada o cuando se pida validar el repositorio.
---

# Verificación Escalonada de Jopói

Ejecutá estos pasos en orden, deteniéndote si alguno falla para diagnosticar y corregir la causa antes de pasar al siguiente:

1. **Tipos TypeScript:**
   `npm run typecheck`
2. **Esquema Prisma:**
   `npm run db:validate`
3. **Tokens del Sistema de Diseño (S20):**
   `npm run test:ui:tokens`
4. **Tests de CLI y Seguridad (S16/S21):**
   `npm run test:cli`
5. **Tests de API e Integración (S17/S21):**
   Verificar primero que PostgreSQL local esté activo con `npm run db:local:status` (si está detenido, pedir permiso para iniciar con `npm run db:local`) y luego correr:
   `npm run test:api`
6. **Preparación de Entrega Offline (S16):**
   `npm run delivery:check`
