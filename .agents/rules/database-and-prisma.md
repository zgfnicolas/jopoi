---
trigger: glob
globs: "**/prisma/**/*, **/src/server/database/**/*.ts, **/scripts/*database*.ts, **/scripts/local-postgres.ts"
description: "Reglas de persistencia PostgreSQL, Prisma 7, diseño relacional 3NF, transacciones ACID, SQLSTATE, TLS y retención (S03, S19, S21)."
---

# Reglas de Base de Datos, SQL Relacional y Prisma 7 (S03, S19, S21)

- **Integridad referencial y FKs compuestas:**
  - Mantener `onDelete: Restrict` en `DemoSession → DemoRun` (nunca borrar una sesión con recorridos).
  - Las entidades composicionales hijas de `DemoRun` (`SessionRunIntent`, `CommandReceipt`, `OperationEvent`, `HcsPublication`, `HcsSubmissionAttempt`) usan `onDelete: Cascade` únicamente para el barrido de retención de 7 días, mientras los triggers `BEFORE UPDATE` (`jopoi_protect_*`) prohíben cualquier edición posterior.
  - Conservar las FKs compuestas `(runId, sessionId)` en `SessionRunIntent` y `(commandId, runId)` en `OperationEvent` para impedir asociación cruzada entre recorridos.
- **Tipos exactos y UTC:** Pesos en `BIGINT` (`declaredGrams`, `receivedGrams`) y humedad en `SMALLINT` (`humidityHundredths`); cero `FLOAT`. Timestamps siempre en `@db.Timestamptz(3)` con sesión forzada a `-c timezone=UTC`.
- **Pool, Timeouts y Mapeo SQLSTATE (`src/server/database/`):**
  - Un único `PrismaClient` por proceso con `@prisma/adapter-pg` (`max: 2`, `connectionTimeoutMillis: 3000`, `idleTimeoutMillis: 10000`, `statement_timeout: 5000`, `lock_timeout: 2000`, `idle_in_transaction_session_timeout: 10000`, `query_timeout: 5500`) y `closeDatabase()` para apagado ordenado.
  - `mapDatabaseError()` traduce `P2034`, `40001` y `40P01` a `VERSION_CONFLICT`, y `55P03` (lock timeout), `57014` (statement timeout), clases `08*`, `53*`, `57P*`, `P1000..P1017`, `P2024` a `DATABASE_UNAVAILABLE`, sin exponer SQL ni credenciales.
- **Transacciones ACID:** Cortas (`maxWait: 2000`, `timeout: 5000`), sin llamadas HTTP ni Hedera adentro. Todo cambio operativo guarda estado, recibo de idempotencia, `OperationEvent` y `HcsPublication` en una misma transacción antes de publicar en testnet.
- **Seguridad y Auditoría (`db:audit`):** Cualquier cambio debe preservar los 12 controles de `src/server/database/audit.ts` (`DB-ROLE`, `DB-OWNER`, `DB-DDL`, `DB-EVENT-UPDATE`, `DB-FUNCTION-EXECUTE`, `DB-TABLES`, `DB-TRIGGERS`, `DB-CONSTRAINTS`, `DB-INDEXES`, `DB-TLS`, `DB-TIMEZONE`, `DB-HISTORIC-TIME`) y `sslmode=verify-full` fuera de loopback.
- **Migraciones:** No editar ni borrar migraciones aplicadas en `prisma/migrations/`, ni usar `db push` o `migrate reset` sin confirmación explícita del usuario.
