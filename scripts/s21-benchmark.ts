import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { provisionRuntime } from "../tests/support/runtime-provision";
import { TestRuntime, eventually } from "../tests/support/runtime";
import { evidenceRevision } from "./lib/evidence";
import { queryMetrics } from "./lib/s21-query-metrics";
import { z } from "zod";
import { benchmarkSchema, diagnosticRow, percentile } from "./lib/s21-measurements";

interface Measurement { route: string; concurrency: number; repetition: number; p50: number; p95: number; errors: number }
const phase = process.argv[2];
if ((phase !== "baseline" && phase !== "after") || process.argv.length !== 3) throw new Error("USAGE: s21-benchmark baseline|after; owned synthetic cluster only");
const directory = resolve(".cache/s21");
await mkdir(directory, { recursive: true });
const owned = await provisionRuntime();
const runtime = new TestRuntime(owned.resources);
const db = new Client({ connectionString: owned.resources.databaseUrl });
try {
  await db.connect();
  await runtime.start();
  let cookie = "";
  async function request(path: string, body?: unknown, visitor = "benchmark") {
    const response = await fetch(runtime.origin + path, { method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, Origin: runtime.origin, "X-Jopoi-Request": "demo", "Content-Type": "application/json", "X-S21-Visitor": visitor },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.slice(0, setCookie.indexOf(";") < 0 ? setCookie.length : setCookie.indexOf(";"));
    const payload: unknown = await response.json();
    return { response, body: payload };
  }
  await request("/api/demo/session", {});
  const start = await request("/api/demo/runs", { requestId: randomUUID() });
  const { run: { traceId } } = z.object({ run: z.object({ traceId: z.string().uuid() }) }).parse(start.body);
  await request(`/api/demo/runs/${traceId}/commands`, { action: "publish", role: "generator", expectedVersion: 1,
    requestId: randomUUID(), quantityKg: "12000", humidityPercent: "28" });
  const observedRun = z.object({ run: z.object({ events: z.array(z.object({ publication: z.object({ verificationState: z.string() }) })) }) });
  await eventually(() => request(`/api/demo/runs/${traceId}`), result => {
    const parsed = observedRun.safeParse(result.body);
    return parsed.success && parsed.data.run.events[0]?.publication.verificationState === "MATCHED";
  });
  // Synthetic relational volume, never served as accepted operational evidence.
  await db.query(`INSERT INTO "DemoSession" SELECT (jsonb_populate_record(NULL::"DemoSession", to_jsonb(s) ||
    jsonb_build_object('id',md5('bench-session-'||g)::uuid,'tokenHash',md5('bench-token-'||g)||md5('bench-token2-'||g),'runCount',3))).*
    FROM "DemoSession" s CROSS JOIN generate_series(1,1000) g LIMIT 1000`);
  await db.query(`INSERT INTO "DemoRun" SELECT (jsonb_populate_record(NULL::"DemoRun",to_jsonb(r)||jsonb_build_object(
    'id',md5('bench-run-'||g)::uuid,'traceId',md5('bench-trace-'||g)::uuid,'sessionId',md5('bench-session-'||((g-1)/3+1))::uuid,
    'creationRequestId',md5('bench-create-'||g)::uuid,'ordinal',(g-1)%3+1))).*
    FROM (SELECT * FROM "DemoRun" WHERE "traceId"=$1::uuid) r CROSS JOIN generate_series(1,3000) g`, [traceId]);
  await db.query(`INSERT INTO "CommandReceipt" SELECT (jsonb_populate_record(NULL::"CommandReceipt",to_jsonb(c)||jsonb_build_object(
    'id',md5('bench-command-'||g)::uuid,'runId',md5('bench-run-'||((g-1)/5+1))::uuid,'requestId',md5('bench-intent-'||g)::uuid))).*
    FROM (SELECT c.* FROM "CommandReceipt" c JOIN "DemoRun" r ON r.id=c."runId" WHERE r."traceId"=$1::uuid LIMIT 1) c
    CROSS JOIN generate_series(1,15000) g`, [traceId]);
  await db.query(`INSERT INTO "OperationEvent" SELECT (jsonb_populate_record(NULL::"OperationEvent",to_jsonb(e)||jsonb_build_object(
    'id',md5('bench-event-'||g)::uuid,'runId',md5('bench-run-'||((g-1)/5+1))::uuid,'commandId',md5('bench-command-'||g)::uuid,'ordinal',(g-1)%5+1))).*
    FROM (SELECT e.* FROM "OperationEvent" e JOIN "DemoRun" r ON r.id=e."runId" WHERE r."traceId"=$1::uuid LIMIT 1) e
    CROSS JOIN generate_series(1,15000) g`, [traceId]);
  await db.query(`INSERT INTO "HcsPublication" ("eventId","nextAttemptAt","updatedAt")
    SELECT md5('bench-event-'||g)::uuid, CASE WHEN g%2=0 THEN '2026-01-01'::timestamptz ELSE '2027-01-01'::timestamptz END,now()
    FROM generate_series(1,15000) g`);
  await db.query(`INSERT INTO "DemoRequest" (id,"requestId","intentHash",name,email,company,"createdAt","expiresAt")
    SELECT md5('bench-contact-'||g)::uuid,md5('bench-request-'||g)::uuid,repeat('a',64),'Synthetic','synthetic@example.invalid','Synthetic',
    '2025-01-01'::timestamptz + g*interval '1 second',CASE WHEN g%2=0 THEN '2025-06-01'::timestamptz ELSE '2027-01-01'::timestamptz END
    FROM generate_series(1,10000) g`);
  await db.query("ANALYZE");
  const plans: Record<string, unknown> = {};
  const queries = {
    export: `SELECT id,"createdAt",name,email,company,message FROM "DemoRequest" WHERE "createdAt"<=$1 AND "expiresAt">$1 ORDER BY "createdAt",id LIMIT 500`,
    cleanup: `SELECT id FROM "DemoRequest" WHERE "expiresAt"<=$1 LIMIT 100`,
    due: `SELECT "eventId" FROM "HcsPublication" WHERE "nextAttemptAt"<=$1 AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=$1) ORDER BY "nextAttemptAt","eventId" LIMIT 10`,
  };
  for (const [name, sql] of Object.entries(queries)) {
    const result = await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, ["2026-01-01T12:00:00Z"]);
    plans[name] = diagnosticRow(result.rows, z.object({ "QUERY PLAN": z.array(z.record(z.string(), z.unknown())).min(1) }))["QUERY PLAN"];
  }
  const measurements: Measurement[] = [];
  const routes: readonly (readonly [string, string])[] = [["session", "/api/demo/session"], ["run", `/api/demo/runs/${traceId}`], ["trace", `/api/traces/${traceId}`]];
  for (const [route, path] of routes) {
    for (let i = 0; i < 20; i++) await request(path, undefined, `warm-${i}`);
    for (const concurrency of [1, 8]) for (let repetition = 1; repetition <= 3; repetition++) {
      const durations: number[] = []; let next = 0, errors = 0;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (next < 50) { const index = next++, start = performance.now();
          const result = await request(path, undefined, `bench-${index}`);
          if (result.response.status !== 200) errors++;
          durations.push(performance.now() - start);
        }
      }));
      durations.sort((a,b) => a-b);
      measurements.push({ route, concurrency, repetition, errors, p50: percentile(durations, 24), p95: percentile(durations, 47) });
    }
  }
  const counter = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+$/)]);
  const statistics = diagnosticRow((await db.query(`SELECT numbackends,xact_commit,xact_rollback,blks_read,blks_hit,deadlocks,temp_bytes
    FROM pg_stat_database WHERE datname=current_database()`)).rows, z.object({ numbackends: counter, xact_commit: counter, xact_rollback: counter, blks_read: counter, blks_hit: counter, deadlocks: counter, temp_bytes: counter }));
  const databaseVersion = diagnosticRow((await db.query("SHOW server_version")).rows, z.object({ server_version: z.string().min(1) })).server_version;
  const report = { phase, ...evidenceRevision(), generatedAt: new Date().toISOString(), environment: "WARM_NEXT_DEV_SYNTHETIC_POSTGRES_NOT_PRODUCTION",
    databaseVersion, nodeVersion: process.version,
    volumes: { sessions: 1000, runs: 3000, events: 15000, contacts: 10000 }, measurements, plans, statistics };
  await writeFile(resolve(directory, `benchmark-${phase}.json`), JSON.stringify(report, null, 2));
  if (phase === "after") {
    const baseline = benchmarkSchema.parse(JSON.parse(await readFile(resolve(directory, "benchmark-baseline.json"), "utf8")));
    const comparisons = measurements.map(item => { const base = baseline.measurements.find(b => b.route === item.route && b.concurrency === item.concurrency && b.repetition === item.repetition);
      if (!base) throw new Error("S21_BASELINE_MEASUREMENT_MISSING");
      const budget = Math.max(base.p95*1.25,base.p95+50); return { ...item, baselineP95: base.p95, budget, passed: item.errors===0 && item.p95<=budget }; });
    await writeFile(resolve(directory, "benchmark-comparison.json"), JSON.stringify({ comparisons, passed: comparisons.every(c=>c.passed) }, null, 2));
    if (comparisons.some(c => !c.passed)) process.exitCode = 1;
    await db.end();
    await queryMetrics(owned.resources,runtime,[["session","/api/demo/session"],["run",`/api/demo/runs/${traceId}`],["trace",`/api/traces/${traceId}`]],cookie);
  }
  console.log(JSON.stringify({ code: "S21_BENCHMARK_RECORDED", phase, measurements: measurements.length, errors: measurements.reduce((sum,m)=>sum+m.errors,0) }));
} finally { await runtime.close(); await db.end(); await owned.close(); }
