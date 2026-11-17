---
name: sql-relational-design
description: Modelar, escribir, revisar y evolucionar bases de datos relacionales en SQL de forma portable (PostgreSQL, MySQL/MariaDB, SQL Server, Oracle, SQLite) — modelado ER, normalización 3NF/BCNF, constraints, tipos, queries, índices, transacciones, migraciones, seguridad y selección de motor. Usar ante diseño de esquemas, revisión de SQL, dudas de dialecto o elección de SGBD.
---

# SQL Relacional — SKL-DB-SQL-001 v2.0

Alcance: SQL estándar (ISO/IEC 9075) + diferencias prácticas entre PostgreSQL 16+, MySQL 8.x / MariaDB 10.6+, SQL Server 2019+, Oracle 19c/23ai y SQLite 3.4x. Para profundidad específica de PostgreSQL usar `postgresql-engineering`.

Prioridades: Correctitud → Integridad → Seguridad → Recuperabilidad → Mantenibilidad → Rendimiento → Portabilidad.

## 0. Modo de trabajo

Establecer motor y versión, entidades/identidad/cardinalidad, invariantes, queries críticas, concurrencia y RPO/RTO. Entregar DDL ejecutable + decisiones + índices justificados por query + mapeo de dialecto.

### Reglas duras (MUST)
- Toda tabla de entidad tiene PK; toda relación tiene FK o excepción documentada.
- Claves de negocio protegidas con `UNIQUE`, no con un `SELECT` previo.
- Dinero/magnitudes exactas en `DECIMAL`/`NUMERIC` o entero en unidad mínima (`BIGINT`), nunca `FLOAT`/`REAL`.
- Fechas y horas en tipos temporales (`TIMESTAMPTZ`), nunca en texto.
- SQL siempre parametrizado; nunca concatenar input.
- La aplicación nunca se conecta como `root`/`sa`/`postgres`/`SYS`.
- `UPDATE`/`DELETE` siempre con `WHERE` revisado.
- Cambios de esquema solo mediante migraciones versionadas.

## 1. Modelado y Normalización

- **Proceso:** Dominio → modelo conceptual → lógico (PK, FK) → constraints → normalización (3NF en OLTP) → queries reales → índices.
- **Identidad:** Surrogate key (`BIGINT GENERATED ALWAYS AS IDENTITY` o `UUIDv7` ordenado) + `UNIQUE` en clave natural; evitar `UUIDv4` en PKs de tablas muy grandes por fragmentación.
- **Normalización:** 1NF (atómico), 2NF (sin dependencia parcial de PK compuesta), 3NF (sin dependencia transitiva).
- **Desnormalización deliberada:** Solo para **snapshots históricos** (ej. snapshot del lote/tarifas/payload al momento del hecho) o agregados medidos.
- **NULL:** Un solo significado por columna; `NOT NULL` por defecto.
- **Naming:** Consistente (`snake_case` o convención explícita del proyecto), constraints nombrados (`pk_`, `fk_`, `uq_`, `ck_`, `ix_`).

## 2. Tipos de datos por motor

- **PostgreSQL:** `BIGINT GENERATED ALWAYS AS IDENTITY`, `uuid`, `text`/`varchar(n)`, `numeric(p,s)` o `bigint` en unidades menores, `timestamptz` en UTC, `boolean`, `jsonb`.
- **Trampas:** En Oracle `''` es `NULL`; en MySQL `utf8` ≠ `utf8mb4` y la collation por defecto ignora mayúsculas/acentos; en SQL Server `timestamp` es un contador binario; en SQLite usar tablas `STRICT` y `PRAGMA foreign_keys = ON`.

## 3. Constraints

- Declarar `PRIMARY KEY`, `UNIQUE`, `CHECK`, `FOREIGN KEY` con nombre explícito.
- Acciones referenciales: `ON DELETE RESTRICT` para entidades maestras/históricas; `ON DELETE CASCADE` solo para composición real dependiente del ciclo de vida del padre; `SET NULL` si es relación opcional.
- Unicidad condicional ante soft delete mediante índice único parcial (`WHERE deleted_at IS NULL`).

## 4. SQL como lenguaje

- **Orden lógico:** `FROM/JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `OFFSET/FETCH`.
- **Lógica de tres valores:** Usar `IS NULL`, `NOT EXISTS` en lugar de `NOT IN` sobre subqueries con posibles `NULL`, `IS [NOT] DISTINCT FROM`.
- **JOINs:** En `LEFT JOIN`, los filtros de la tabla derecha van en `ON`, no en `WHERE`. Usar `EXISTS`/`NOT EXISTS` para semi/anti-joins.
- **Sargabilidad:** No aplicar funciones sobre columnas indexadas en `WHERE`; usar rangos semiabiertos `[inicio, fin)`.
- **Paginación:** Keyset pagination `(created_at, id) < ($1, $2)` con índice compuesto en datasets grandes.
- **Upsert e idempotencia:** `INSERT ... ON CONFLICT DO UPDATE/NOTHING` (PostgreSQL/SQLite) + `UNIQUE` en clave de idempotencia.
- **Parametrización y lectura:** Cero `SELECT *`; evitar N+1; ingestas por lotes o `COPY`.

## 5. Índices

- Igualdad primero, ordenamiento después, rango al final en índices compuestos.
- Indexar FKs en PostgreSQL/SQL Server/Oracle (no se crean automáticamente).
- Eliminar índices duplicados o no usados (`idx_scan = 0`).

## 6. Planes de ejecución

`EXPLAIN (ANALYZE, BUFFERS)` en PostgreSQL (`BEGIN ... ROLLBACK` para DML). Comparar filas estimadas vs reales, revisar scans secuenciales, spills a disco y waits por locks.

## 7. Transacciones y concurrencia

- Transacciones cortas, sin llamadas HTTP/colas adentro.
- Conocer el aislamiento por defecto (`READ COMMITTED` en PG/Oracle/SQL Server, `REPEATABLE READ` en MySQL InnoDB).
- Contra **lost update**: 1) update condicional atómico, 2) concurrencia optimista (`WHERE id = $1 AND version = $2`), 3) bloqueo pesimista (`FOR UPDATE` / `SKIP LOCKED`).
- Prevención de deadlocks: orden consistente de locks, índices en FKs y timeouts configurados + reintento con backoff y jitter ante `40001`/`40P01`.

## 8. Lógica en el servidor

Triggers válidos para auditoría o inmutabilidad que no puede saltearse (documentados y testeados); nunca para esconder lógica de negocio arbitraria.

## 9. Seguridad

Roles separados (`migration_role` DDL vs `app_role` DML mínimo vs `readonly_role`), RLS en multi-tenant, `sslmode=verify-full` para TLS real (no solo `require`), cero secretos en SQL/logs.

## 10. Migraciones

Versionadas y nunca editadas tras aplicarse; conocer si el motor tiene DDL transaccional (sí en PG/SQLite/SQL Server; no en MySQL/Oracle); patrón zero-downtime **Expand → Migrate/Backfill → Switch → Contract**.

## 11. Operación

Backups + PITR con pruebas periódicas de restore (una réplica no es un backup); pool dimensionado; monitoreo de locks, queries lentas y lag.

## 12. Selección de motor

PostgreSQL como default sólido para integridad, SQL avanzado, JSONB y concurrencia MVCC; SQLite solo embebido/single-writer.

## 13. Ejemplo canónico

Tablas normalizadas con `PK`, `FK` (`RESTRICT` / `CASCADE` según composición), `CHECK`, `UNIQUE`, índices por query y snapshots históricos (`unit_price`).

## 14. Antipatrones

Sin PK/FK · `N:M` en CSV/array · `FLOAT` para dinero · fechas como texto · `CASCADE` indiscriminado · `SELECT *` · `NOT IN` con `NULL` · filtro de `LEFT JOIN` en `WHERE` · `OFFSET` profundo · `SELECT-then-INSERT` · SQL concatenado · app como admin · `TLS` sin verificar certificado.

## 15. Definition of Done

PK/FK en todo el modelo; 3NF; tipos exactos; 100% SQL parametrizado; planes revisados; concurrencia protegida (version/locks); roles separados; backups probados.

## 16. Niveles

Fundamentos (CRUD/JOINs) → Profesional (3NF/índices/EXPLAIN/keyset/roles) → Avanzado (MVCC/lost update/write skew/PITR/online DDL) → Arquitectura (selección y recuperación sin pérdida de integridad).

## 17. Referencias

ISO/IEC 9075, PostgreSQL/MySQL/SQL Server/Oracle/SQLite docs, Bill Karwin (*SQL Antipatterns*), Markus Winand (*SQL Performance Explained*).

---

## 18. Aplicación en Jopói

- **Modelo 3NF y FKs compuestas:** [`prisma/schema.prisma`](../../../prisma/schema.prisma) define 11 tablas con PKs y FKs explícitas, incluyendo claves foráneas compuestas `(runId, sessionId)` en `SessionRunIntent` y `(commandId, runId)` en `OperationEvent` para garantizar integridad de pertenencia a nivel SQL.
- **Snapshots históricos justificados:** `DemoRun.scenarioSnapshot`, `CommandReceipt.result` y `OperationEvent.payload` (`JSONB`) conservan el estado inmutable al momento del hecho sin romperse ante futuros cambios del escenario v1.
- **Exactitud numérica y UTC:** Pesos en `BIGINT` (`declaredGrams`, `receivedGrams`), humedad en `SMALLINT` (`humidityHundredths`) y marcas temporales en `TIMESTAMPTZ(3)` UTC.
- **Políticas referenciales:** `DemoSession → DemoRun` usa `ON DELETE RESTRICT`; los hijos composicionales de `DemoRun` usan `ON DELETE CASCADE` únicamente para el barrido de retención de 7 días.
