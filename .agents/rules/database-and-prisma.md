---
trigger: glob
globs: "**/prisma/**/*, **/src/server/database/**/*.ts, **/scripts/*database*.ts, **/scripts/local-postgres.ts"
description: "Reglas de persistencia PostgreSQL, Prisma, transacciones ACID, TLS y retención (S03, S19, S21)."
---

# Reglas de Base de Datos y Prisma (S03, S19, S21)

- **Integridad referencial:** Mantener `onDelete: Restrict` en las relaciones de `DemoSession`, `DemoRun`, `OperationEvent` y `HcsPublicationAttempt`. No usar `Cascade` silencioso.
- **Transacciones ACID:** Todo comando operativo guarda en una misma transacción SQL el cambio en `DemoRun` (con control de concurrencia por `version`), el `OperationEvent`, el recibo de idempotencia y el estado de publicación pendiente antes de invocar Hedera HCS.
- **Conexiones y TLS (S21):**
  - Forzar zona horaria UTC en las sesiones de PostgreSQL.
  - Fuera de loopback (`127.0.0.1` / `localhost`), exigir TLS estricto (`sslmode=verify-full`).
- **Migraciones:** No editar ni borrar migraciones ya existentes en `prisma/migrations/`. No ejecutar `prisma migrate reset` ni crear migraciones nuevas sin confirmación explícita del usuario.
- **Retención (S10):** Los recorridos vencen a los 7 días y los contactos a los 90 días; el borrado físico ocurre en lotes acotados durante el mantenimiento diario.
