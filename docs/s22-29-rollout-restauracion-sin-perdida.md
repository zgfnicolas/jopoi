# S22-29 · Ensayar migraciones y restauración sin alterar evidencia (`D01`, `D03`, `D10`, `D13`, `D16`, `D18`, `D19`, `AUD-02`, `AUD-09`, `AUD-13`, `AUD-14`, `AUD-15`, `AUD-17`)

## 1. Trazabilidad y Contexto

- **Spec S22:** Historias 19, 20, 46, 47, 66, 75, 76, 77, 78, 79, 80, 82, 83 y 86.
- **Decisiones de arquitectura:**
  - `D01`: Migración transparente, compatibilidad hacia atrás y preservación de invariantes de negocio.
  - `D03`: Idempotencia de comandos, no duplicación de envíos y reconciliación de estado incierto.
  - `D10`: Manejo de sesiones, inactividad y revocación sin pérdida de trazabilidad.
  - `D13`: Telemetría acotada, contexto distribuido W3C y persistencia no destructiva.
  - `D16`: Persistencia operativa, validación de integridad y consistencia relacional.
  - `D18`: Estrategia Expand/Backfill/Switch y preservación de compatibilidad en rollback.
  - `D19`: Puertas de calidad reproducibles, ensayos de recuperación y automatización estricta.
- **Hallazgos de auditoría:**
  - `AUD-02`: Limpieza sostenible sin borrado accidental de evidencia histórica vigente.
  - `AUD-09`: Observabilidad de operaciones, registro de atrasos y monitoreo de sincronización.
  - `AUD-13`: Seguridad en sesiones, migración de esquemas y protección de credenciales.
  - `AUD-14`: Detección estricta de estados inválidos, inmutabilidad de digests y cuarentena documentada.
  - `AUD-15`: Tratamiento de errores uniforme sin degradar la confiabilidad del servicio.
  - `AUD-17`: Resiliencia en operaciones asíncronas con Hedera Consensus Service (HCS).
- **Escenarios de verificación:** `S22-06`, `S22-11`, `S22-16`, `S22-17`, `S22-25`, `S22-29`, `S22-30` y `S22-31`.

---

## 2. Runner Único y Conexión Administrativa Separada (`D17`, `D19`)

Para evitar colisiones entre instancias efímeras en despliegues concurrentes y mantener la seguridad en el nivel de acceso a datos, Jopói formaliza la ejecución de migraciones bajo las siguientes directivas:

### 2.1. Advisory Lock de Sesión en PostgreSQL
Se implementa un mecanismo de bloqueo distribuido a nivel de base de datos utilizando `pg_try_advisory_lock` con el identificador numérico de 64 bits `MIGRATION_ADVISORY_LOCK_ID = 2026111529`:
1. El runner único intenta adquirir el lock mediante `SELECT pg_try_advisory_lock(2026111529)`.
2. Si el lock ya está retenido por otro proceso de migración, la función devuelve `false` y el runner falla cerrado inmediatamente (`MIGRATION_RUNNER_CONCURRENT_LOCK_HELD`), evitando migraciones paralelas simultáneas.
3. Concluida la migración (o ante cualquier excepción), el lock se libera de forma determinista mediante `SELECT pg_advisory_unlock(2026111529)`.

### 2.2. Separación Estricta de Credenciales (Admin DDL vs App DML)
- **Conexión Administrativa (`DIRECT_URL` / rol `s17` o `neondb_owner`):** Utilizada exclusivamente por el runner de migraciones (`prisma migrate deploy`). Posee privilegios de DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`) sobre el esquema `public`.
- **Conexión de Aplicación (`DATABASE_URL` / rol `s21_app`):** Utilizada por el servidor web y los endpoints HTTP. Tiene privilegios restringidos exclusivamente a DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) en tablas autorizadas, con prohibición explícita de `CREATE TABLE`, `ALTER TABLE` o modificación de funciones y triggers de inmutabilidad (`NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`).

### 2.3. Prohibición de Migraciones en Build y Herramientas Destructivas
- **Build sin Migrar:** El script `"build": "next build"` en `package.json` tiene estrictamente prohibido ejecutar `prisma migrate`. Las migraciones se gestionan de manera independiente en la fase de release previa al despliegue.
- **Prohibición de `db push` y `migrate dev`:** Ambas herramientas están vetadas en entornos de producción y CI/CD porque alteran esquemas sin trazabilidad, destruyen constraints no versionados o generan discrepancias con el historial de migraciones. Toda mutación estructural debe regirse por `prisma migrate deploy`.

### 2.4. Inmutabilidad y Verificación de Checksums en `_prisma_migrations`
El verificador `verifyMigrationChecksums` computa el hash SHA-256 de cada archivo `prisma/migrations/*/migration.sql` en el disco y lo contrasta con la columna `checksum` de la tabla `_prisma_migrations`. Si cualquier migración aplicada previamente fue editada o modificada retroactivamente, el despliegue se bloquea de inmediato (`CHECKSUM_MISMATCH`).

---

## 3. Estrategia Expand / Backfill en Lotes / Switch (`D02`, `D10`, `D17`, `D18`)

Jopói adopta el patrón *Expand / Backfill / Switch* para garantizar despliegues continuos sin tiempo de inactividad (*zero-downtime*) y sin degradar la concurrencia:

### 3.1. Fase Expand (DDL Aditivo Seguro)
- Las columnas nuevas se crean como nulables o con valores `DEFAULT` que no requieren bloqueo prolongado de tabla.
- Los nuevos constraints de verificación (`CHECK`) se agregan obligatoriamente con la cláusula `NOT VALID`. Esto permite que las escrituras entrantes comiencen a validarse de inmediato sin obligar a PostgreSQL a escanear exhaustivamente millones de filas existentes bajo un lock exclusivo.
- Toda transacción de DDL aplica límites defensivos estrictos:
  ```sql
  SET LOCAL lock_timeout = '2000ms';
  SET LOCAL statement_timeout = '30000ms';
  ```

### 3.2. Fase Backfill en Lotes (Rendimiento y Descompresión)
- Los registros históricos existentes se actualizan en lotes acotados (`batchSize: 5-500`) utilizando `SELECT ... FOR UPDATE SKIP LOCKED`.
- Cada lote se procesa en una transacción independiente, liberando los locks de fila inmediatamente y permitiendo el acceso concurrente del tráfico de producción.
- El proceso registra métricas de progreso (`totalProcessed`, `batchesCount`, `durationMs`) y es reanudable ante interrupciones.

### 3.3. Fase Switch (Validación Asíncrona)
- Una vez completado el backfill, se ejecuta `ALTER TABLE ... VALIDATE CONSTRAINT ...` con `lock_timeout = '2000ms'`.
- PostgreSQL realiza la validación histórica adquiriendo únicamente un lock `SHARE UPDATE EXCLUSIVE`, el cual no bloquea lecturas ni escrituras concurrentes de la aplicación.

### 3.4. Coexistencia Verificada entre Versión Anterior (v1) y Nueva (v2)
El ensayo en `scripts/rollout-restore.ts` demuestra empíricamente la coexistencia simultánea de dos versiones de la aplicación durante el período de despliegue progresivo:
1. **Sesión (`DemoSession`):** La versión v1 crea sesiones sin especificar `lastActivityAt` (aprovecha el `DEFAULT CURRENT_TIMESTAMP`), mientras que la versión v2 actualiza `lastActivityAt` y respeta `revokedAt`. Ambas conviven sin conflicto.
2. **Admisión (`RequestRateBucket`):** La versión v1 utiliza los scopes base (`SESSION`, `TRACE`), mientras que la versión v2 utiliza los nuevos scopes (`MUTATION`, `PRIVATE_READ`, `PUBLICATION`). Ambas respetan la restricción `subject = 'GLOBAL' OR subject ~ '^[a-f0-9]{64}$'`.
3. **Capacidad y Slots (`MaintenanceLease`):** Las instancias concurrentes reservan y liberan leases de tareas y slots de capacidad externa (`EXTERNAL_CAPACITY_<n>`) sin interbloqueos (*deadlocks*).
4. **Contexto de Telemetría (`HcsPublication`):** Publicaciones insertadas por v1 (con telemetría nula) y por v2 (con `telemetryTraceId` y `telemetrySpanId`) conviven armónicamente en el outbox transaccional.

---

## 4. Detección de Estado Histórico Inválido y Cuarentena (`S22-11`, `AUD-14`)

El sistema prohíbe taxativamente alterar la historia operativa para maquillar datos o facilitar migraciones:

### 4.1. Principios Innegociables
1. **Cero Fabricación de Datos:** Si un registro histórico carece de un dato requerido (por ejemplo, `receivedGrams` en un recorrido en estado `RECEIVED`), **está estrictamente prohibido** rellenar el campo con números sintéticos o arbitrarios.
2. **Inmutabilidad Criptográfica de Digests:** Los hashes SHA-256 de recibos (`CommandReceipt.intentHash`) y eventos (`OperationEvent.digest`) son sagrados. Ningún script de migración puede recalcular o modificar un digest histórico.
3. **Inmutabilidad de Scripts Aplicados:** No se editan archivos SQL de migraciones ya aplicadas para relajar constraints ante datos defectuosos.

### 4.2. Comportamiento ante Infracciones
- Si un dato inconsistente intenta ser validado por una migración, el motor de PostgreSQL dispara un error `23514` (`check_violation`) bajo el constraint `DemoRun_state_coherence`, deteniendo el despliegue de inmediato.
- **Protocolo de Cuarentena:** Las filas corruptas o incoherentes detectadas se aíslan formalmente en cuarentena documental (`QuarantineRecord`), preservando la evidencia original completa (`originalEvidence`) y el motivo del aislamiento (`reason`), sin contaminar el modelo operacional activo.

---

## 5. Restauración Aislada y Reconciliación con Hedera Consensus Service (`S22-30`, `D03`, `AUD-17`)

El ensayo de recuperación demuestra la capacidad de restaurar la base de datos relacional sin corromper la sincronización con el ledger descentralizado:

### 5.1. Restauración en Base de Datos Aislada (`s22_restore_isolated`)
- Se recrea el esquema relacional completo a partir de los archivos de migración auditados.
- Se transfieren todas las tablas de negocio (`DemoSession`, `DemoRun`, `SessionRunIntent`, `CommandReceipt`, `OperationEvent`, `HcsPublication`, `HcsSubmissionAttempt`, `DailyQuota`).
- **Verificación de Paridad Absoluta (100%):** Se comprueba la paridad exacta entre la base de datos origen y la restaurada:
  - Coincidencia total de conteo de filas en todas las tablas.
  - Coincidencia criptográfica del hash MD5 agregado del JSON de todas las filas ordenadas por clave.
  - Paridad de estados, payloads, digests e identidades externas.

### 5.2. Reconciliación de Envíos Inciertos a HCS
En caso de una caída de servidor o restauración de backup donde existan mensajes en vuelo hacia Hedera (`sequenceNumber IS NULL`):
1. El proceso de reconciliación consulta el tópico en Hedera (o el ledger simulado) utilizando el `eventId` determinista.
2. **Si el mensaje ya fue secuenciado en Hedera:** La base de datos local actualiza su estado a `CONFIRMED` y `verificationState = 'MATCHED'`, registrando el `sequenceNumber` y `consensusTimestamp` existentes. **No se reenvía el mensaje**, previniendo la duplicación en la blockchain.
3. **Si el mensaje no existe en el ledger:** La publicación permanece encolada para su reintento seguro con el mismo `eventId` y `digest` original.

> [!CAUTION]
> **La Restauración SQL NO Revierte el Ledger:**
> Restaurar un backup de PostgreSQL a un punto anterior en el tiempo restablece el estado de las tablas relacionales, pero **jamás revierte transacciones ya selladas en la red Hedera**. El ledger público es inmutable; la reconciliación siempre toma como fuente de verdad suprema la secuencia y el timestamp de consenso emitidos por la red descentralizada.

---

## 6. Rollback de Código y Deferencia de Contratos Destructivos (`D01`, `D18`)

### 6.1. Rollback Seguro de la Aplicación
Dado que el esquema de base de datos se mantiene en un estado expandido y compatible hacia atrás (las nuevas columnas son nulables o tienen valores por defecto), si se revierte el código de la aplicación de la versión v2 a la v1, el sistema continúa funcionando con normalidad:
- La versión v1 ignora las columnas añadidas (`rolloutMetadata`, `telemetryTraceId`, etc.).
- No se producen errores de lectura ni excepciones de inserción.

### 6.2. Deferencia de la Fase Destructiva (*Contract*)
- Eliminar columnas obsoletas (`ALTER TABLE ... DROP COLUMN`) o renombrar tablas se difiere conscientemente fuera del alcance de esta entrega.
- La fase destructiva sólo se autoriza una vez que la nueva versión del código ha operado de forma estable en producción durante el período de observación requerido.

### 6.3. Realidad de RPO y RTO en Infraestructura Gratuita
Jopói documenta con total transparencia las limitaciones del nivel gratuito (*Hobby / Free Tier*) de Neon y Vercel:
- No existe conmutación por error (*failover*) automática multi-región en caliente sin costo.
- El RTO (*Recovery Time Objective*) depende del aprovisionamiento manual o asistido del nuevo clúster ($15\text{ a }45\text{ minutos}$).
- El RPO (*Recovery Point Objective*) está delimitado por la ventana de respaldos lógicos diarios o el WAL retenido. No se fabrican garantías irreales de RPO=0.

---

## 7. Separación de Incumbencias (Local Comprobado vs Proveedor Pendiente - `Ticket 31`)

El reporte técnico generado ([`.cache/s22-rollout/rollout-restore-report.json`](file:///C:/Users/Facundo/dev/jopoi/.cache/s22-rollout/rollout-restore-report.json)) sella formalmente la división entre las capacidades verificadas localmente y las que requieren auditoría en la nube:

```json
"separationOfConcerns": {
  "localProvenRollout": true,
  "providerPending": true,
  "globalAcceptance": false,
  "pendingExternalVerification": [
    "Verificación de backups automatizados gestionados en Neon / proveedor real (Ticket 31)",
    "Acreditación de permisos de roles y TLS verify-full en conexión remota real (Ticket 31)",
    "Medición de RTO/RPO real en infraestructura de nube vs simulación local (Ticket 31)"
  ]
}
```

- **Rollout Local Comprobado (`localProvenRollout: true`):** El runner único con advisory lock, el backfill en lotes con lock timeout, la coexistencia v1/v2, la cuarentena de estados inválidos, el restore aislado con paridad y la reconciliación HCS funcionan y están demostrados.
- **Límites de Proveedor Pendientes (`providerPending: true`):** Los mecanismos de backup automatizado en Neon, la rotación de roles y la conmutación de hosting real se auditan en el entorno desplegado.
- **Aceptación Global Bloqueada (`globalAcceptance: false`):** La validación integral en producción se delega formalmente al **Ticket 31** (*Aceptación operativa del candidato*).
