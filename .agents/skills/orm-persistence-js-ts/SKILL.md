---
name: orm-persistence-js-ts
description: Elegir, configurar, revisar y operar la capa de persistencia SQL en Node.js/TypeScript con el ORM o query builder adecuado — Prisma 7/8, Drizzle, Kysely, TypeORM, MikroORM, Sequelize y drivers directos — con matriz de decisión, buenas prácticas de SQL independientes del ORM, transacciones y concurrencia, errores por SQLSTATE, multi-tenancy con RLS, pooling, migraciones seguras (expand-contract), seguridad, observabilidad y testing.
---

# Persistencia SQL en JS/TS — SKL-ARCH-ORM-001 v4.0

Estado verificado: noviembre de 2026. Motor de referencia: PostgreSQL (los principios aplican a MySQL/MariaDB, SQLite y SQL Server con sus variantes). Skills relacionadas: `postgresql-engineering`, `sql-relational-design`, `js-project-configuration`.

Prioridades: Integridad → Seguridad → Correctitud → Migrabilidad → Observabilidad → Performance → Simplicidad.

## 0. Modo de trabajo

### 0.1 Contexto a determinar
- `TOOL=` (prisma7 · prisma8-rc · drizzle · kysely · typeorm · mikro-orm · sequelize · knex · driver directo)
- `TOOL_VERSION=` (leer `package.json` y lockfile; nunca asumir)
- `ENGINE=` (postgresql · mysql/mariadb · sqlite · sqlserver · cockroachdb · otro)
- `DRIVER=` (pg · postgres.js · mysql2 · better-sqlite3/node:sqlite · neon/planetscale serverless…)
- `DEPLOY=` (long-running con N réplicas · serverless · edge · worker · CLI)
- `POOLER=` (ninguno · PgBouncer modo transacción · proxy gestionado)
- `TENANCY=` (single · tenantId compartido · schema/DB por tenant · RLS)
- `ARQUITECTURA=` (CRUD L0/L1 · dominio L2 con repositorios · microservicios)
- `MIGRATION_OWNER=` (qué herramienta es la única dueña del schema)

### 0.2 Formato de entrega
Código y config del ORM y la versión detectados; no mezclar APIs de majors (Prisma 7/8, Drizzle 0.45/1.0, TypeORM 0.3/1.x). Queries críticas con SQL generado, índice y estimación de filas. Migraciones con SQL revisado, locks/reescrituras, compatibilidad N-1/N+1 y roll-forward. Errores mapeados a errores de dominio/HTTP (§3.8).

### 0.3 Reglas duras (MUST)
- Versión fijada (`~` o exacta) del ORM, su CLI y el driver; lockfile commiteado; nunca instalar sin versión un paquete cuyo latest es otro major (ej. `prisma`).
- Versiones mínimas sin vulnerabilidades conocidas (§1); advisories revisados en CI.
- Una instancia de cliente/pool por proceso; nunca conectar ni desconectar por request.
- Pool dimensionado a nivel sistema y con timeout de adquisición, `statement_timeout` e `idle_in_transaction_session_timeout`.
- Sin mass assignment: mapeo explícito de campos permitidos.
- SQL dinámico solo parametrizado; identificadores dinámicos solo desde whitelist en código.
- Multi-tenant: `tenant` en todo `where` (y RLS si aplica), con tests cross-tenant.
- Transacciones cortas, sin I/O externo; reintento acotado ante `40001`/`40P01`.
- Un único dueño de migraciones por base; en producción, migraciones desde un job único antes del rollout; nunca `db push`, `drizzle-kit push`, `synchronize: true` ni `sync({ alter })`.
- Nunca editar migraciones aplicadas; renames y cambios incompatibles con SQL revisado y expand-contract.
- Dinero en `numeric`/`Decimal`, nunca `float`; fechas en `timestamptz`.
- Tests de persistencia contra el mismo motor y major que producción.

## 1. Estado del ecosistema (nov 2026)

| Herramienta | Estable | En curso | Mínimo recomendado / nota |
| :--- | :--- | :--- | :--- |
| Prisma ORM | 7.10.x (`@prisma/client`) | 8 RC (`@prisma/orm-postgres`) | Fijar `prisma@~7` y `@prisma/client@~7` (`@prisma/adapter-pg`). v6 sin parches desde 19/11/2026. |
| Drizzle ORM | 0.45.x | 1.0 RC | Fijar sobre 0.45; adoptar 1.0 en su GA. |
| Kysely | 0.29.x | 0.30 beta | El migrador vive en `kysely/migration` desde 0.29. |
| TypeORM | 1.x | — | Node 20+, `@typeorm/codemod v1`, `@nestjs/typeorm >= 11.0.1`. |
| MikroORM | 7.1.x | — | `>= 7.0.6` (CVE crítico en anteriores); ESM nativo. |
| Sequelize | 6.37.8 | v7 alpha | Solo mantenimiento (`>= 6.37.8`); no para proyectos nuevos. |
| Drivers directos | `pg`, `postgres.js`, `mysql2` | — | Con SafeQL o TypedSQL para tipar SQL estático. |

## 2. Elegir la herramienta

- **Prisma 7:** Schema DSL, migraciones maduras, driver adapters (`@prisma/adapter-pg`), excelente DX y seguridad de tipos.
- **Drizzle 0.45:** SQL en TS, overhead muy bajo, ideal para serverless/edge o quienes priorizan control SQL sin codegen.
- **Kysely 0.29:** Query builder tipado (`kysely-codegen`), ideal para reportes, CTE, window functions y bases existentes.
- **MikroORM 7:** Data Mapper + Unit of Work + Identity Map nativo para dominios ricos (L2).
- **Sequelize / Knex:** No iniciar proyectos nuevos.

## 3. SQL y modelo: prácticas independientes del ORM

- **Tipos:** `UUIDv7` o `BIGINT GENERATED ALWAYS AS IDENTITY`; `timestamptz`; `numeric(p,s)` para dinero; `NOT NULL` por defecto; `jsonb` validado con esquema al leer/escribir.
- **Integridad:** `UNIQUE`, `FK`, `CHECK`, `EXCLUDE` en DB; `ON DELETE RESTRICT` por defecto (`CASCADE` solo para composición real).
- **Índices:** Igualdad primero, orden después, rango al final; indexar FKs usadas en `JOIN`/`DELETE`; eliminar índices no usados.
- **Queries:** Proyección explícita (nunca `SELECT *`), predicados sargables, keyset pagination `(created_at, id) < ($1, $2)`, cero N+1, updates atómicos condicionales (`UPDATE ... WHERE ... AND version = $2`), `FOR UPDATE SKIP LOCKED` para colas.
- **Transacciones y timeouts:** Cortas, sin HTTP/colas adentro. Definir `statement_timeout`, `idle_in_transaction_session_timeout` y `lock_timeout`.
- **Mapeo de errores por `SQLSTATE` (§3.8):**
  - `23505` (`P2002`) → `ConflictError` (`409`)
  - `23503` (`P2003`) / `23514` / `23502` → `ValidationError` (`400`/`422`)
  - `40001` (`serialization_failure`) / `40P01` (`deadlock_detected`) / `P2034` → conflicto transaccional / reintento acotado o `409`
  - `55P03` (`lock_not_available`), `57014` (`statement_timeout`), `53300`, `08*` → `UnavailableError` (`503`)
  - Nunca filtrar mensajes o queries de la DB al cliente.

## 4. Conexiones y pooling

- Presupuesto: `réplicas_max × pool_max + workers + migraciones + admin <= max_connections × 0.8`.
- Pool único por proceso con `connectionTimeoutMillis`, `idleTimeoutMillis` y `statement_timeout`; en serverless `max` bajo (1–3) + pooler externo en modo transacción (`-pooler`) y conexión directa para migraciones.
- Separar roles: `DATABASE_URL` (DML mínimo) ≠ `MIGRATION_DATABASE_URL` (DDL); la app nunca es owner ni superuser.

## 5. Perfiles por herramienta (Prisma 7)

- `prisma/schema.prisma` (`provider = "prisma-client"`) + `prisma.config.ts` con `env("MIGRATION_DATABASE_URL")` separado de runtime.
- `PrismaPg` (`@prisma/adapter-pg`) con singleton en `globalThis` en dev.
- `TypedSQL` o `$queryRaw` con tagged templates (`Prisma.sql`, `Prisma.join`); prohibido `$queryRawUnsafe` con input.
- Migraciones: `migrate dev --create-only` → revisar SQL → `migrate deploy` en deploy. Revisar renames (generan `DROP` + `ADD`).

## 6. Migraciones seguras

Un solo dueño del schema; `CREATE INDEX CONCURRENTLY` fuera de transacción; `ADD CONSTRAINT ... NOT VALID` → `VALIDATE CONSTRAINT`; `SET lock_timeout`; patrón **Expand → Backfill → Switch → Contract**; compatibilidad N-1 y N+1.

## 7. Multi-tenancy y RLS

`tenant_id` en todo `WHERE` y primero en índices compuestos; RLS (`FORCE ROW LEVEL SECURITY`) fijando `set_config('app.tenant_id', ..., true)` dentro de la misma transacción interactiva.

## 8. Seguridad

Cero SQL concatenado (`$queryRawUnsafe`, `sql.raw` con input), cero mass assignment, proyección explícita sin campos sensibles, sin SQL con parámetros en logs de producción.

## 9. Arquitectura

ORM en infraestructura (`src/server/database/`); los modelos del ORM no se exponen como DTOs públicos ni reemplazan al dominio puro (`src/domain/`).

## 10. Observabilidad

Instrumentación OTel (`@prisma/instrumentation`, `@opentelemetry/instrumentation-pg`), `pg_stat_statements`, `log_lock_waits`, `EXPLAIN (ANALYZE, BUFFERS)`.

## 11. Testing

Integración contra PostgreSQL real (mismo major que producción, nunca SQLite para features PG). Probar constraints (`23505`/`P2002`), concurrencia optimista (`409`), rollbacks, aislamiento cross-tenant/sesión y reintentos `40001`/`40P01`.

## 12. Cambiar de ORM

Solo con motivo medible y ADR; congelar migraciones, introducir adaptador nuevo detrás de repositorios por módulo (strangler) compartiendo el presupuesto de conexiones, y transferir baseline solo al retirar el ORM viejo.

## 13. Antipatrones

`npm i prisma` sin fijar versión en proyecto v7 · mezclar majors · `db push`/`synchronize: true` en prod · editar migraciones aplicadas · pool por request · pool sin timeout · `SELECT *` · N+1 · read-modify-write · HTTP dentro de transacciones · `float` para dinero · `SQL` concatenado · filtrar detalles de DB al cliente.

## 14. Definition of Done

Herramienta/versión fijadas; pool acotado con timeouts; errores SQLSTATE mapeados sin fugas; un único dueño de migraciones; roles DML/DDL separados; tests contra PostgreSQL real.

## 15. KPIs

Queries/request constantes (sin N+1) · conexiones en espera ~0 · errores mapeados por SQLSTATE · 0 incidentes por drift de migraciones.

## 16. Referencias

Prisma ORM 7 docs (`prisma.config.ts`, driver adapters, TypedSQL, Error reference, Migrate), Drizzle 0.45, Kysely 0.29, PostgreSQL Appendix A (SQLSTATE) y RLS.

---

## 17. Aplicación en Jopói

- **Esquema y configuración Prisma 7:** [`prisma/schema.prisma`](../../../prisma/schema.prisma) (`prisma-client` ESM con `@prisma/adapter-pg` `7.10.1`) y [`prisma.config.ts`](../../../prisma.config.ts) (separa `generate`/`validate` de `migrate`).
- **Cliente, pool y transacciones:** [`src/server/database/client.ts`](../../../src/server/database/client.ts) (`max: 2`, `connectionTimeoutMillis: 3000`, `idleTimeoutMillis: 10000`, `statement_timeout: 5000`, `query_timeout: 5500`) e [`src/server/database/index.ts`](../../../src/server/database/index.ts) (`withTransaction` `Serializable` con `maxWait: 2000`, `timeout: 5000`, `advanceRunVersion`).
- **Mapeo SQLSTATE sin fugas:** [`src/server/database/errors.ts`](../../../src/server/database/errors.ts) traduce `P2034`, `40001` y `40P01` a `VERSION_CONFLICT`, y `55P03`, `57014`, `53300`, `08*`, `P1000..P1017`, `P2024` a `DATABASE_UNAVAILABLE`.
- **Auditoría de controles SQL:** [`src/server/database/audit.ts`](../../../src/server/database/audit.ts) (`npm run db:audit`).
