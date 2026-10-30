import { Client } from "pg";
import { databaseConnection } from "./connection-policy";
import { inspectOperationHistory } from "../operations/history-audit";

export interface DatabaseControl { id: string; passed: boolean; evidence: "catalog" | "session" }

/** SELECT-only, no row values, connection strings, role names or provider errors in output. */
export async function auditDatabase(url: string, operationsOnly = false) {
  const client = new Client({ ...databaseConnection(url), connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const operations = await inspectOperationHistory(client);
    if (operationsOnly) {
      await client.query("COMMIT");
      return { code: "OPERATION_HISTORY_OBSERVED", observedAt: new Date().toISOString(), ...operations };
    }
    const { rows: [role] } = await client.query<{ restricted: boolean }>(`SELECT NOT EXISTS(SELECT 1 FROM pg_roles
      WHERE (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) AND pg_has_role(oid,'MEMBER')) AS restricted`);
    const { rows: [objects] } = await client.query<{ unowned: boolean; no_create: boolean; protected_events: boolean; no_public_execute: boolean; tables: boolean; triggers: boolean }>(`SELECT
      NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(c.relowner,'USAGE')) AS unowned,
      NOT has_schema_privilege(current_user,'public','CREATE') AS no_create,
      NOT has_table_privilege(current_user,'"OperationEvent"','UPDATE') AS protected_events,
      NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
        LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE n.nspname='public' AND p.proname LIKE 'jopoi_protect_%' AND a.grantee=0 AND a.privilege_type='EXECUTE') AS no_public_execute,
      (SELECT count(*)=11 FROM pg_tables WHERE schemaname='public' AND tablename IN
        ('DemoSession','DemoRun','SessionRunIntent','CommandReceipt','OperationEvent','HcsPublication','HcsSubmissionAttempt','MaintenanceLease','DailyQuota','DemoRequest','RequestRateBucket')) AS tables,
      (SELECT count(*)=4 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN
        ('OperationEvent_immutable','DemoRun_immutable_fields','DemoRun_hcs_binding_immutable','HcsSubmissionAttempt_immutable')) AS triggers`);
    const { rows: [ssl] } = await client.query<{ encrypted: boolean }>("SELECT coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false) AS encrypted");
    const {rows:[timezone]}=await client.query<{utc:boolean}>("SELECT current_setting('TimeZone')='UTC' AS utc");
    const {rows:[history]}=await client.query<{valid:boolean}>(`SELECT NOT EXISTS(SELECT 1 FROM "OperationEvent" WHERE NOT
      (CASE WHEN pg_input_is_valid(payload->>'appliedAt','timestamp with time zone')
        THEN (payload->>'appliedAt')::timestamptz="appliedAt" ELSE false END)) AS valid`);
    const { rows: [constraints] } = await client.query<{ valid: boolean }>(`SELECT
      NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated)
      AND (SELECT count(*)>=11 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='p')
      AND (SELECT count(*)=7 FROM pg_constraint WHERE conname IN ('DemoRun_sessionId_fkey','CommandReceipt_runId_fkey',
        'OperationEvent_runId_fkey','OperationEvent_commandId_runId_fkey','HcsPublication_eventId_fkey',
        'SessionRunIntent_runId_sessionId_fkey','HcsSubmissionAttempt_eventId_fkey'))
      AND (SELECT count(*)=7 FROM pg_constraint WHERE conname IN ('DemoSession_run_count','DemoRun_ordinal','DemoRun_humidity',
        'DemoRun_assignment','OperationEvent_digest','DemoRequest_required_fields','DemoRun_state_coherence')) AS valid`);
    const { rows: [indexes] } = await client.query<{ valid: boolean }>(`SELECT count(*)=7 AS valid FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      JOIN pg_namespace n ON n.oid=i.relnamespace WHERE n.nspname='public' AND x.indisunique AND x.indisvalid AND i.relname IN
      ('DemoSession_tokenHash_key','DemoRun_traceId_key','DemoRun_sessionId_creationRequestId_key','CommandReceipt_runId_requestId_key',
        'OperationEvent_runId_ordinal_key','HcsSubmissionAttempt_eventId_slot_key','DemoRequest_requestId_key')`);
    await client.query("COMMIT");
    if (!role || !objects || !ssl || !timezone || !history || !constraints || !indexes) throw new Error("DATABASE_AUDIT_RESULT_INCOMPLETE");
    const controls: DatabaseControl[] = [
      { id: "DB-ROLE", passed: role.restricted, evidence: "catalog" },
      { id: "DB-OWNER", passed: objects.unowned, evidence: "catalog" },
      { id: "DB-DDL", passed: objects.no_create, evidence: "catalog" },
      { id: "DB-EVENT-UPDATE", passed: objects.protected_events, evidence: "catalog" },
      { id: "DB-FUNCTION-EXECUTE", passed: objects.no_public_execute, evidence: "catalog" },
      { id: "DB-TABLES", passed: objects.tables, evidence: "catalog" },
      { id: "DB-TRIGGERS", passed: objects.triggers, evidence: "catalog" },
      { id: "DB-CONSTRAINTS", passed: constraints.valid, evidence: "catalog" },
      { id: "DB-INDEXES", passed: indexes.valid, evidence: "catalog" },
      { id: "DB-TLS", passed: ssl.encrypted, evidence: "session" },
      { id: "DB-TIMEZONE", passed: timezone.utc, evidence: "session" },
      { id: "DB-HISTORIC-TIME", passed: history.valid, evidence: "session" },
      { id: "DB-OPERATION-HISTORY", passed: operations.passed, evidence: "session" },
    ];
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
    return { code: "DATABASE_SECURITY_OBSERVED", observedAt: new Date().toISOString(), local,
      controls, operations, passed: controls.every(c=>c.passed || local && c.id === "DB-TLS"),
      external: "BACKUP_NETWORK_POLICY_AND_DEPLOYMENT_PENDING" };
  } catch (error) { await client.query("ROLLBACK").catch(()=>{}); throw error; }
  finally { await client.end(); }
}
