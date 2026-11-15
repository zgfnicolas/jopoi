---
trigger: model_decision
description: "Aplicar al consultar, crear o modificar el esquema de base de datos prisma/schema.prisma o transacciones SQL."
---

# Reglas para Persistencia y Base de Datos

- **Integridad referencial y auditoría:** Nunca aplicar `ON DELETE CASCADE` en relaciones de entidades de auditoría o trazabilidad. La relación `DemoSession → DemoRun` debe mantenerse como `RESTRICT` para prevenir la pérdida accidental de datos en recorridos activos.
- **Evolución del esquema sin pérdida:**
  - Toda columna nueva agregada a una tabla existente debe declarar un valor por defecto explícito (`@default(...)`) o definirse como nullable (`?`) para no bloquear datos existentes.
  - Prohibido modificar o eliminar columnas que contengan datos de producción sin una estrategia de migración en tres fases (*Expand / Backfill / Contract*).
- **Convenciones de migraciones Prisma:**
  - Una migración por cambio lógico, utilizando nombres semánticos claros en minúsculas con guiones.
  - Nunca modificar los checksums ni los archivos SQL de migraciones históricas ya aplicadas.
  - Las migraciones estructurales solo se ejecutan a través de `npx prisma migrate deploy` mediante el runner administrativo aislado, nunca durante el paso de compilación (`next build`).
- **Documentación sincronizada:** Cualquier cambio en `prisma/schema.prisma` exige actualizar de inmediato el diagrama ER y el diccionario de datos en [`docs/data_model.md`](docs/data_model.md).
- **Prohibición de comandos destructivos:** Prohibido correr `prisma db push` o `prisma migrate reset` sin autorización expresa y explícita del usuario.
