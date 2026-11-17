---
name: postgresql-engineering
description: Diseñar, revisar, optimizar, migrar y operar bases PostgreSQL 16–18 (modelado, constraints, tipos, índices, EXPLAIN, MVCC/concurrencia, RLS, migraciones zero-downtime, VACUUM, replicación, backup/PITR). Usar ante DDL, queries lentas, revisiones de esquema o decisiones de arquitectura de datos con PostgreSQL.
---

# PostgreSQL Engineering — SKL-DB-POSTGRES-001 v2.1

Baseline: PostgreSQL 18 (marcas `[PG17]`, `[PG18]`). Prioridades: Correctitud → Integridad → Seguridad → Recuperabilidad → Mantenibilidad → Observabilidad → Rendimiento → Escalabilidad.

## 0. Modo de trabajo

Definir invariantes, identidad, límites transaccionales, concurrencia, 5–10 queries críticas con SLO, volumen/retención y RPO/RTO. Entregar DDL ejecutable, diagnóstico por plan real (`EXPLAIN (ANALYZE, BUFFERS)`), migraciones con `lock_timeout` y revisión por severidad.

### Reglas duras (MUST)
- Toda tabla tiene PK; toda relación tiene FK salvo excepción documentada.
- Unicidad de negocio protegida por `UNIQUE`/índice único, nunca por `SELECT` previo.
- Dinero/magnitudes exactas en `numeric` o enteros (`bigint`), nunca `real`/`double`.
- Eventos absolutos en `timestamptz`.
- SQL siempre parametrizado.
- La app nunca se conecta como `superuser` ni como `owner` de las tablas.
- Ningún DDL en producción sin `lock_timeout` y sin conocer el lock que toma.
- `EXPLAIN ANALYZE` sobre DML solo dentro de `BEGIN ... ROLLBACK`.
- Nunca deshabilitar `autovacuum` globalmente.
- Una réplica no es un backup; un backup no restaurado no es evidencia.

## 1. Modelado

3NF en OLTP; `bigint GENERATED ALWAYS AS IDENTITY` o `uuid` (`uuidv7()` en PG18); surrogate + `UNIQUE` en clave natural; `COMMENT ON` para semántica no obvia; índices únicos parciales (`WHERE deleted_at IS NULL`) para soft deletes.

## 2. Tipos

`text` + `CHECK` (en lugar de `varchar` arbitrarios), `numeric(p,s)`/`bigint` para dinero, `timestamptz`, `interval`, `boolean`, `uuid`, `inet`/`cidr`, `tstzrange`/`daterange`, `ENUM` para dominios estables, `jsonb`, PostGIS, `pgvector`. Preferir ICU o `builtin` para collations.

## 3. Constraints

`CHECK`, `UNIQUE NULLS NOT DISTINCT` (`[PG15]`), `DOMAIN`, `EXCLUDE USING gist (room_id WITH =, during WITH &&)` para no superposición concurrente, `ON DELETE RESTRICT` por defecto e índices manuales en FKs (PostgreSQL no los crea solo).

## 4. JSONB

Usar para payloads variables o metadata; promover a columna lo que se filtra/ordena siempre o exige FK. Índices `GIN (jsonb_ops)` o `GIN (jsonb_path_ops)` o B-tree de expresión; validar estructura mínima con `CHECK (jsonb_typeof(...) = 'object')`.

## 5. Índices

B-tree (igualdad primero, orden después, rango al final), Hash, GIN, GiST, SP-GiST, BRIN (append-only correlacionado). `INCLUDE` para index-only scans; parciales para subconjuntos calientes; detectar índices sin uso (`pg_stat_user_indexes.idx_scan = 0`).

## 6. Planner y diagnóstico

`EXPLAIN (ANALYZE, BUFFERS, SETTINGS)`. Revisar estimación vs filas reales, scans, `work_mem` (spill a disco), `shared read`, waits por locks en `pg_stat_activity`, bloat/VACUUM y N+1. Usar `CREATE STATISTICS` ante columnas correlacionadas; no deshabilitar `enable_*` en prod.

## 7. Transacciones y concurrencia

- `READ COMMITTED` + updates atómicos/locks o `SERIALIZABLE` (SSI) con reintentos ante `40001` y `40P01` (backoff exponencial + jitter).
- Configurar `statement_timeout`, `idle_in_transaction_session_timeout` y `lock_timeout` por rol o pool.
- Patrones: decremento atómico, concurrencia optimista (`WHERE id = $1 AND version = $2`), `FOR UPDATE SKIP LOCKED`, `INSERT ... ON CONFLICT`, `pg_try_advisory_xact_lock`.

## 8. SQL idiomático

`RETURNING` (`old.*`, `new.*` en PG18), `MERGE`, `DISTINCT ON` / `LATERAL`, window functions, keyset pagination, `COPY` para cargas masivas, `tsvector` + `GIN` / `pg_trgm`, `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

## 9. Lógica en servidor

Triggers válidos para auditoría o inmutabilidad (`BEFORE UPDATE`); evitar excepciones PL/pgSQL en loops calientes; toda función `SECURITY DEFINER` debe fijar `SET search_path = pg_catalog, pg_temp` y revocar `EXECUTE FROM PUBLIC`.

## 10. Seguridad

- Roles separados: `app_owner` (`NOLOGIN`), `app_migrator`, `app_runtime` (sin `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `BYPASSRLS`, ni ownership), `app_readonly`.
- **RLS multi-tenant:** `ENABLE` + `FORCE ROW LEVEL SECURITY`, `set_config('app.tenant_id', $1, true)` local a la transacción (seguro con PgBouncer transaction mode).
- **Red/TLS:** `hostssl + scram-sha-256` en `pg_hba.conf`, cliente con `sslmode=verify-full` (no solo `require` contra MITM).

## 11. Migraciones

Analizar locks DDL (`ADD COLUMN`, `ALTER TYPE`, `SET NOT NULL` via `CHECK ... NOT VALID` + `VALIDATE`, `CREATE INDEX CONCURRENTLY` fuera de transacción). Usar `SET lock_timeout = '3s'` y patrón **Expand → Migrate/Backfill → Switch → Contract**.

## 12. Mantenimiento (MVCC)

`autovacuum` siempre activo (ajustar `scale_factor` por tabla caliente); vigilar transacciones largas, replication slots huérfanos y edad de XID (`age(datfrozenxid)`); `fillfactor < 100` para favorecer HOT updates.

## 13. Particionamiento

Solo por ciclo de vida/retención (`DETACH`/`DROP` en vez de `DELETE` masivo) o pruning real medido (`RANGE`/`LIST`/`HASH`); PK/UNIQUE incluyen la clave de partición.

## 14. Conexiones

Pool dimensionado en la app; compatibilidad PgBouncer transaction mode (`SET LOCAL`, `set_config(..., true)`, `max_prepared_statements`).

## 15. Replicación, HA y recuperación

WAL, streaming vs síncrona según RPO, replicación lógica, slots vigilados (`max_slot_wal_keep_size`), base backup + WAL archiving = PITR; `pg_dump` no reemplaza PITR; probar restores periódicos.

## 16. Observabilidad

`pg_stat_statements`, `pg_stat_activity`, `pg_stat_replication`, `pg_replication_slots`, `age(datfrozenxid)`, `pg_stat_user_tables`, `pg_stat_user_indexes`.

## 17. Testing

Integración contra PostgreSQL real (Testcontainers, mismo major), tests de concurrencia reales (2+ conexiones, `40001`, deadlocks, lost updates), ensayo de migraciones.

## 18. Escalabilidad

Orden: Queries → índices → esquema → autovacuum → config medida → pooling → vertical → caché → réplicas lectura → particionamiento → sharding.

## 19. Antipatrones

Diseñar según ORM · todo `varchar`/`jsonb` · FK sin índice cuando se usa · `EXPLAIN ANALYZE` DML sin `ROLLBACK` · deshabilitar `autovacuum` · HTTP dentro de tx · DDL sin `lock_timeout` · `CREATE INDEX` bloqueante · réplica como backup · app como `postgres`/owner · `sslmode=require` creyendo que verifica identidad · `SECURITY DEFINER` sin `search_path`.

## 20. Definition of Done

100% PK/FK; 3NF; tipos exactos; índices por query; timeouts configurados; retry `40001`/`40P01`; DDL con `lock_timeout`; app sin superuser/ownership/BYPASSRLS; `verify-full` en remoto; autovacuum y PITR verificados.

## 21. Niveles

Fundamentos → Profesional → Senior → Staff (decide con evidencia y sabe recuperar sin perder integridad).

---

## 22. Aplicación en Jopói

- **Constraints y Triggers en migraciones:** [`prisma/migrations/202610220001_initial/migration.sql`](../../../prisma/migrations/202610220001_initial/migration.sql) y posteriores implementan `CHECK` constraints sobre SHA-256, rangos, `num_nonnulls`, estructura `JSONB` y 4 triggers PL/pgSQL (`OperationEvent_immutable`, `DemoRun_immutable_fields`, `DemoRun_hcs_binding_immutable`, `HcsSubmissionAttempt_immutable`) con `REVOKE EXECUTE ... FROM PUBLIC`.
- **Auditoría automatizada de 12 controles (`npm run db:audit`):** [`src/server/database/audit.ts`](../../../src/server/database/audit.ts) comprueba `DB-ROLE`, `DB-OWNER`, `DB-DDL`, `DB-EVENT-UPDATE`, `DB-FUNCTION-EXECUTE`, `DB-TABLES`, `DB-TRIGGERS`, `DB-CONSTRAINTS`, `DB-INDEXES`, `DB-TLS`, `DB-TIMEZONE` (`UTC`) y `DB-HISTORIC-TIME`.
- **Política TLS y UTC:** [`src/server/database/connection-policy.ts`](../../../src/server/database/connection-policy.ts) fuerza `-c timezone=UTC` y exige TLS verificado (`sslmode=verify-full` en migraciones y `rejectUnauthorized: true` en pool fuera de loopback).
