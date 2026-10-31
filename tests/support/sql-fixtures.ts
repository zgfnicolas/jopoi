import { Client } from "pg";
import type { TestResources } from "./runtime-provision";
import { ownedResources } from "./owned-resources";

/** Fixture preparation only. Assertions observe HTTP, the UI or authorized CSV. */
export function createFixtures(resources: TestResources) {
  async function execute(sql: string, values: unknown[] = [], exceptional = false): Promise<void> {
    await ownedResources(resources);
    const target = new URL(resources.databaseUrl);
    if (target.hostname !== "127.0.0.1" || target.port !== String(resources.pgPort) || target.pathname !== "/s17_api") throw new Error("TEST_DATABASE_NOT_OWNED");
    const client = new Client({ connectionString: resources.databaseUrl, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      if (exceptional) { await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role = replica"); }
      await client.query(sql, values);
      if (exceptional) await client.query("COMMIT");
    } catch (error) { if (exceptional) await client.query("ROLLBACK"); throw error; }
    finally { await client.end(); }
  }
  return {
    execute,
    clear: () => execute(`DO $$ DECLARE names text; BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ',') INTO names
        FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';
      IF names IS NOT NULL THEN EXECUTE 'TRUNCATE ' || names || ' CASCADE'; END IF;
    END $$;`),
    exceptional: {
      snapshot: (traceId: string, snapshot: unknown) => execute('UPDATE "DemoRun" SET "scenarioSnapshot"=$2::jsonb WHERE "traceId"=$1::uuid', [traceId, JSON.stringify(snapshot)], true),
      payload: (eventId: string, payload: unknown) => execute('UPDATE "OperationEvent" SET payload=$2::jsonb WHERE id=$1::uuid', [eventId, JSON.stringify(payload)], true),
      failEventCommit: () => execute(`CREATE FUNCTION s17_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'S17_INJECTED_COMMIT_FAILURE person@example.invalid private-password private-signed-bytes'; END $$;
        CREATE CONSTRAINT TRIGGER s17_fail_event AFTER INSERT ON "OperationEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION s17_fail_event();`),
      restoreEventCommit: () => execute('DROP TRIGGER IF EXISTS s17_fail_event ON "OperationEvent"; DROP FUNCTION IF EXISTS s17_fail_event();'),
    },
  };
}
