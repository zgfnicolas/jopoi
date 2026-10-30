import { Client } from "pg";
import { randomBytes } from "node:crypto";

/** Only called against the freshly initialized, owned test cluster after migrations. */
export async function provisionApplicationRole(databaseUrl: string): Promise<string> {
  const url=new URL(databaseUrl);
  if(url.hostname!=="127.0.0.1" || url.pathname!=="/s17_api") throw new Error("TEST_ROLE_TARGET_NOT_OWNED");
  const db=new Client({connectionString:databaseUrl});await db.connect();
  const password=randomBytes(32).toString("hex");
  try{
    // Generated hex password, never request text or a caller-provided identifier.
    await db.query(`CREATE ROLE s21_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    await db.query('GRANT CONNECT ON DATABASE s17_api TO s21_app');
    await db.query('GRANT USAGE ON SCHEMA public TO s21_app');
    await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON "DemoSession","DemoRun","DailyQuota","RequestRateBucket" TO s21_app');
    await db.query('GRANT SELECT,INSERT ON "SessionRunIntent","CommandReceipt","OperationEvent" TO s21_app');
    await db.query('GRANT SELECT,INSERT,UPDATE ON "HcsPublication","HcsSubmissionAttempt","MaintenanceLease" TO s21_app');
    await db.query('GRANT SELECT,INSERT,DELETE ON "DemoRequest" TO s21_app');
    url.username="s21_app";url.password=password;
    return url.href;
  }finally{await db.end();}
}
