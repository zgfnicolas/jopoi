import { Client } from "pg";
import { inject } from "vitest";

/** SQL is only for fixture preparation and actual infrastructure faults, never assertions. */
export async function fixture(sql: string, values: unknown[] = [], exceptional = false): Promise<void> {
  const resources = inject("resources");
  const target = new URL(resources.databaseUrl);
  if (target.hostname !== "127.0.0.1" || target.port !== String(resources.pgPort) || target.pathname !== "/s17_api") {
    throw new Error("TEST_DATABASE_NOT_OWNED");
  }
  const client = new Client({ connectionString: resources.databaseUrl, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    if (exceptional) { await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role = replica"); }
    await client.query(sql, values);
    if (exceptional) await client.query("COMMIT");
  } catch (error) {
    if (exceptional) await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

export async function clearFixtures() {
  await fixture(`DO $$ DECLARE names text; BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ',') INTO names
      FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';
    IF names IS NOT NULL THEN EXECUTE 'TRUNCATE ' || names || ' CASCADE'; END IF;
  END $$;`);
}

export const exceptional = {
  snapshot: (traceId: string, snapshot: unknown) => fixture('UPDATE "DemoRun" SET "scenarioSnapshot"=$2::jsonb WHERE "traceId"=$1::uuid', [traceId, JSON.stringify(snapshot)], true),
  payload: (eventId: string, payload: unknown) => fixture('UPDATE "OperationEvent" SET payload=$2::jsonb WHERE id=$1::uuid', [eventId, JSON.stringify(payload)], true),
  failEventCommit: () => fixture(`CREATE FUNCTION s17_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'S17_INJECTED_COMMIT_FAILURE'; END $$;
    CREATE CONSTRAINT TRIGGER s17_fail_event AFTER INSERT ON "OperationEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION s17_fail_event();`),
  restoreEventCommit: () => fixture('DROP TRIGGER IF EXISTS s17_fail_event ON "OperationEvent"; DROP FUNCTION IF EXISTS s17_fail_event();'),
};
