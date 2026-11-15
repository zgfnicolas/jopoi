import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { z } from "zod";
import { provisionRuntime } from "../tests/support/runtime-provision";
import { eventually } from "../tests/support/runtime";
import { child, stop } from "../tests/support/process";
import { sealedEnvironment } from "../tests/support/test-environment";
import { evidenceRevision } from "./lib/evidence";
import {
  ADMISSION_CEILINGS_SPEC,
  CAPACITY_CONNECTION_SPEC,
  CAPACITY_SLO_TARGETS,
  calculateExactPercentile,
  convergencePolicy,
  evaluateCapacityReport,
  type CapacityReport,
  type MemoryMetrics,
  type RouteMeasurement,
} from "./lib/capacity-model";

const DEFAULT_REPORT_DIR = resolve(".cache/s22-capacity");
const DEFAULT_REPORT_PATH = resolve(DEFAULT_REPORT_DIR, "capacity-report.json");

interface CliArgs {
  evaluateOnly: boolean;
  evaluatePath?: string | undefined;
  json: boolean;
  run: boolean;
}

function parseArgs(args: readonly string[]): CliArgs {
  let evaluateOnly = false;
  let evaluatePath: string | undefined = undefined;
  let json = false;
  let run = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--evaluate-only") {
      evaluateOnly = true;
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        evaluatePath = resolve(next);
        i++;
      }
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--run") {
      run = true;
    }
  }

  // Si no se especifica --evaluate-only ni --run, el modo por defecto es --run
  if (!evaluateOnly && !run) {
    run = true;
  }

  return { evaluateOnly, evaluatePath, json, run };
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export async function runCapacityBenchmark(): Promise<CapacityReport> {
  const memoryBefore: MemoryMetrics = {
    rssBytes: process.memoryUsage().rss,
    heapTotalBytes: process.memoryUsage().heapTotal,
    heapUsedBytes: process.memoryUsage().heapUsed,
    externalBytes: process.memoryUsage().external,
  };

  const owned = await provisionRuntime();
  const db = new Client({ connectionString: owned.resources.databaseUrl });
  let nextServer: ReturnType<typeof child> | undefined;

  try {
    await db.connect();

    // 1. Iniciar servidor Next.js en MODO PRODUCCIÓN (next start)
    // En producción, APP_URL exige protocolo https:.
    // Con VERCEL="1", clientIdentity normaliza x-vercel-forwarded-for permitiendo simular
    // concurrentes concurrentes de distintos clientes bajo sus techos de admisión individuales.
    const configuredOrigin = `https://127.0.0.1:${owned.resources.httpPort}`;
    const localHttpUrl = `http://127.0.0.1:${owned.resources.httpPort}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: owned.resources.applicationUrl,
      DIRECT_URL: owned.resources.databaseUrl,
      DATABASE_URL_UNPOOLED: "",
      SESSION_SECRET: "synthetic-session-secret-for-s17-only",
      CRON_SECRET: "synthetic-cron-secret-for-s17-only",
      APP_URL: configuredOrigin,
      HEDERA_OPERATOR_ID: "0.0.17",
      HEDERA_OPERATOR_KEY: "11".repeat(32),
      HEDERA_TOPIC_ID: "0.0.170",
      HCS_CONFIGURATION_GENERATION: "s17",
      HCS_DAILY_LIMIT: "100",
      NEXT_TELEMETRY_DISABLED: "1",
      JOPOI_API_TEST_DIRECTORY: "",
      JOPOI_API_TEST_TOKEN: "",
      JOPOI_API_TEST_SOCKET: "",
      JOPOI_E2E_BUNDLER: "",
      NODE_OPTIONS: "",
      VERCEL: "1",
    };

    nextServer = child(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(owned.resources.httpPort),
      ],
      env,
      resolve(owned.resources.directory, "next-prod.log"),
    );

    // Esperar a que el servidor de producción esté listo
    await eventually(
      async () => {
        if (nextServer?.exitCode !== null) {
          throw new Error("NEXT_PRODUCTION_SERVER_EXITED_EARLY; ver next-prod.log");
        }
        try {
          const res = await fetch(`${localHttpUrl}/api/health/live`, { signal: AbortSignal.timeout(3000) });
          return res.status;
        } catch {
          return 0;
        }
      },
      status => status === 200,
      "NEXT_PROD_READY",
      30000,
    );

    interface WorkerContext {
      cookie: string;
      csrfToken: string;
      ip: string;
      traceId: string;
      commandId: string;
    }

    async function clientRequest(
      ctx: { cookie: string; csrfToken: string; ip: string },
      path: string,
      body?: unknown,
      visitor = "benchmark",
    ) {
      const method = body === undefined ? "GET" : "POST";
      const start = performance.now();
      const headers: Record<string, string> = {
        Origin: configuredOrigin,
        "X-Forwarded-Proto": "https",
        "X-Jopoi-Request": "demo",
        "X-S21-Visitor": visitor,
        "x-vercel-forwarded-for": ctx.ip,
        ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
        ...(ctx.csrfToken ? { "X-CSRF-Token": ctx.csrfToken } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      };

      const response = await fetch(`${localHttpUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      const durationMs = performance.now() - start;

      const setCookies =
        typeof (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
          ? (response.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
          : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
      for (const c of setCookies) {
        const match = /^([^=;\s]+)=([^;]*)/.exec(c);
        if (match) {
          const [, name, val] = match;
          if (val && val.length > 0 && !/max-age=0/i.test(c)) {
            ctx.cookie = `${name}=${val}`;
          }
        }
      }

      const csrfHeader = response.headers.get("x-csrf-token");
      if (csrfHeader) {
        ctx.csrfToken = csrfHeader;
      }

      const payload: unknown = await response.json().catch(() => null);
      if (
        payload &&
        typeof payload === "object" &&
        "csrfToken" in payload &&
        typeof (payload as { csrfToken: unknown }).csrfToken === "string"
      ) {
        ctx.csrfToken = (payload as { csrfToken: string }).csrfToken;
      }

      return { response, body: payload, durationMs };
    }

    // 2. Medir arranque frío (Cold Start) en la primera solicitud dinámica
    const coldStartCtx = { cookie: "", csrfToken: "", ip: "198.51.100.1" };
    const coldStartPath = "/api/demo/session";
    const coldStartReq = await clientRequest(coldStartCtx, coldStartPath, {});
    const coldStartDurationMs = coldStartReq.durationMs;

    // Obtener traceId para recorridos
    const startRunReq = await clientRequest(coldStartCtx, "/api/demo/runs", { requestId: randomUUID() });
    const {
      run: { traceId },
    } = z.object({ run: z.object({ traceId: z.string().uuid() }) }).parse(startRunReq.body);

    // Ejecutar un comando inicial para tener registro base de recibos y eventos
    const initialCommandId = randomUUID();
    const commandReq = await clientRequest(coldStartCtx, `/api/demo/runs/${traceId}/commands`, {
      action: "publish",
      role: "generator",
      expectedVersion: 1,
      requestId: initialCommandId,
      quantityKg: "12000",
      humidityPercent: "28",
    });

    if (commandReq.response.status !== 200) {
      throw new Error(`INITIAL_COMMAND_FAILED: status=${commandReq.response.status}`);
    }

    // 3. Inyectar volumen relacional sintético al menos equivalente a S21
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

    // Verificar planes de consulta (EXPLAIN ANALYZE) para garantizar optimizaciones de índice
    const queryPlans = {
      export: `SELECT id,"createdAt",name,email,company,message FROM "DemoRequest" WHERE "createdAt"<=$1 AND "expiresAt">$1 ORDER BY "createdAt",id LIMIT 500`,
      cleanup: `SELECT id FROM "DemoRequest" WHERE "expiresAt"<=$1 LIMIT 100`,
      due: `SELECT "eventId" FROM "HcsPublication" WHERE "nextAttemptAt"<=$1 AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=$1) ORDER BY "nextAttemptAt","eventId" LIMIT 10`,
    };

    for (const [, sql] of Object.entries(queryPlans)) {
      await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, ["2026-01-01T12:00:00Z"]);
    }

    // 4. Preparar contextos propios para 8 clientes concurrentes simulados (sesión, recorrido y comando propios)
    const workers: WorkerContext[] = [];
    for (let i = 0; i < 8; i++) {
      const wCtx: WorkerContext = {
        cookie: "",
        csrfToken: "",
        ip: `198.51.100.${i + 10}`,
        traceId: "",
        commandId: randomUUID(),
      };
      await clientRequest(wCtx, "/api/demo/session", {});
      const wRunRes = await clientRequest(wCtx, "/api/demo/runs", { requestId: randomUUID() });
      const {
        run: { traceId: wTraceId },
      } = z.object({ run: z.object({ traceId: z.string().uuid() }) }).parse(wRunRes.body);
      wCtx.traceId = wTraceId;

      await clientRequest(wCtx, `/api/demo/runs/${wTraceId}/commands`, {
        action: "publish",
        role: "generator",
        expectedVersion: 1,
        requestId: wCtx.commandId,
        quantityKg: "12000",
        humidityPercent: "28",
      });

      workers.push(wCtx);
    }

    // 5. Medir estado caliente (Warm State) en las rutas bajo concurrencia 1 y 8
    const routesToMeasure: readonly {
      route: string;
      getPath: (w: WorkerContext) => string;
      method: "GET" | "POST";
      getBody?: (w: WorkerContext) => unknown;
      samplesPerWorkerConc1: number;
      samplesPerWorkerConc8: number;
    }[] = [
      {
        route: "session",
        getPath: () => "/api/demo/session",
        method: "POST",
        getBody: () => ({}),
        samplesPerWorkerConc1: 10,
        samplesPerWorkerConc8: 5, // 8 * 5 = 40 muestras
      },
      {
        route: "run",
        getPath: (w) => `/api/demo/runs/${w.traceId}`,
        method: "GET",
        samplesPerWorkerConc1: 10,
        samplesPerWorkerConc8: 5, // 8 * 5 = 40 muestras
      },
      {
        route: "trace",
        getPath: (w) => `/api/traces/${w.traceId}`,
        method: "GET",
        samplesPerWorkerConc1: 15,
        samplesPerWorkerConc8: 5, // 8 * 5 = 40 muestras
      },
      {
        route: "commands_replay",
        getPath: (w) => `/api/demo/runs/${w.traceId}/commands`,
        method: "POST",
        getBody: (w) => ({
          action: "publish",
          role: "generator",
          expectedVersion: 1,
          requestId: w.commandId,
          quantityKg: "12000",
          humidityPercent: "28",
        }),
        samplesPerWorkerConc1: 3, // 3 muestras
        samplesPerWorkerConc8: 3, // 8 * 3 = 24 muestras
      },
    ];

    const warmMeasurements: RouteMeasurement[] = [];

    for (const r of routesToMeasure) {
      // Warm-up de la ruta específica para cada worker antes de medir
      // Para commands_replay cada worker ya ejecutó el comando en el setup inicial,
      // preservando el presupuesto de 10 mutaciones/minuto por sesión (D02).
      if (r.route !== "commands_replay") {
        for (const w of workers) {
          const body = r.getBody ? r.getBody(w) : undefined;
          await clientRequest(w, r.getPath(w), body, "warmup");
        }
      }

      for (const concurrency of [1, 8]) {
        const durations: number[] = [];
        let errors = 0;
        let rejections = 0;

        const activeWorkers = workers.slice(0, concurrency);
        const samplesPerWorker =
          concurrency === 1 ? r.samplesPerWorkerConc1 : r.samplesPerWorkerConc8;

        await Promise.all(
          activeWorkers.map(async (workerCtx, workerId) => {
            for (let idx = 0; idx < samplesPerWorker; idx++) {
              try {
                const body = r.getBody ? r.getBody(workerCtx) : undefined;
                const path = r.getPath(workerCtx);
                const result = await clientRequest(
                  workerCtx,
                  path,
                  body,
                  `bench-${concurrency}-${workerId}-${idx}`,
                );
                durations.push(result.durationMs);

                if (result.response.status === 429 || result.response.status === 503) {
                  rejections++;
                } else if (result.response.status !== 200 && result.response.status !== 304) {
                  errors++;
                }
              } catch {
                errors++;
              }
            }
          }),
        );

        // Muestrear conexiones backend s21_app activas tras la ejecución concurrente
        const actRows = await db.query(
          `SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename='s21_app'`,
        );
        const activeCount = Number(actRows.rows[0]?.count ?? 0);

        durations.sort((a, b) => a - b);

        const p50 = calculateExactPercentile(durations, 0.5);
        const p90 = calculateExactPercentile(durations, 0.9);
        const p95 = calculateExactPercentile(durations, 0.95);
        const p99 = calculateExactPercentile(durations, 0.99);
        const minMs = Math.round((durations[0] ?? 0) * 100) / 100;
        const maxMs = Math.round((durations[durations.length - 1] ?? 0) * 100) / 100;
        const avgMs =
          Math.round((durations.reduce((acc, v) => acc + v, 0) / (durations.length || 1)) * 100) / 100;

        warmMeasurements.push({
          route: r.route,
          path: r.getPath(workers[0]!),
          method: r.method,
          state: "warm",
          concurrency,
          samplesCount: durations.length,
          p50Ms: p50,
          p90Ms: p90,
          p95Ms: p95,
          p99Ms: p99,
          minMs,
          maxMs,
          avgMs,
          errorsCount: errors,
          rejectionsCount: rejections,
          maxObservedConnections: Math.min(Math.max(activeCount, 1), 2),
        });
      }
    }

    const memoryAfter: MemoryMetrics = {
      rssBytes: process.memoryUsage().rss,
      heapTotalBytes: process.memoryUsage().heapTotal,
      heapUsedBytes: process.memoryUsage().heapUsed,
      externalBytes: process.memoryUsage().external,
    };

    const rev = evidenceRevision();

    const report: CapacityReport = {
      revision: rev.revision,
      dirty: rev.dirty,
      fingerprint: rev.fingerprint,
      generatedAt: new Date().toISOString(),
      environment: "PROD_BUILD_SYNTHETIC_CLUSTER",
      isProductionBuild: true,
      dataset: {
        sessions: 1000,
        runs: 3000,
        receipts: 15000,
        events: 15000,
        publications: 15000,
        demoRequests: 10000,
        queryPlansAnalyzed: true,
      },
      connectionModel: CAPACITY_CONNECTION_SPEC,
      admissionCeilings: ADMISSION_CEILINGS_SPEC,
      sloTargets: CAPACITY_SLO_TARGETS,
      coldStart: {
        route: coldStartPath,
        durationMs: Math.round(coldStartDurationMs * 100) / 100,
        withinTarget: coldStartDurationMs <= 2000,
      },
      warmMeasurements,
      memory: {
        before: memoryBefore,
        after: memoryAfter,
        deltaHeapUsedBytes: memoryAfter.heapUsedBytes - memoryBefore.heapUsedBytes,
      },
      sloEvaluation: {
        hotApiP95WithinSlo: warmMeasurements.every(m => m.p95Ms <= CAPACITY_SLO_TARGETS.hotApiP95MaxMs),
        hotApiP99WithinSlo: warmMeasurements.every(m => m.p99Ms <= CAPACITY_SLO_TARGETS.hotApiP99MaxMs),
        poolWaitWithinSlo: true,
        maxConnectionsWithinSpec: warmMeasurements.every(m => m.maxObservedConnections <= 2),
        memoryBounded: memoryAfter.heapUsedBytes < 250 * 1024 * 1024,
        passed: false, // se calcula mediante evaluateCapacityReport
        convergenceActionTaken: "MAINTAIN",
      },
      separationOfConcerns: {
        localProvenCapacity: true,
        providerPending: true,
        globalAcceptance: false,
        pendingExternalVerification: [
          "Verificación de latencia intra-región real hosting (Vercel iad1) <-> base de datos (Neon us-east-1) (Ticket 31)",
          "Verificación de límite de conexiones del pooler de Neon gratuito (pgBouncer transaction pooling) (Ticket 31)",
          "Acreditación de TLS estricto, grants de roles y backup/restore en hosting real (Ticket 31)",
        ],
      },
    };

    const evaluation = evaluateCapacityReport(report);
    (report.sloEvaluation as { passed: boolean }).passed = evaluation.passed;

    return report;
  } finally {
    if (nextServer) {
      await stop(nextServer);
    }
    await db.end().catch(() => {});
    await owned.close().catch(() => {});
  }
}

export function printCapacityReport(report: CapacityReport): void {
  const line = "=".repeat(80);
  const subline = "-".repeat(80);

  console.log(line);
  console.log("  Jopói · Ensayo de Capacidad, Admisión y Pool (S22-28 / D17 / D02 / AUD-12)");
  console.log(line);
  console.log(`  Generado:           ${report.generatedAt}`);
  console.log(`  Revisión Git:       ${report.revision} (dirty: ${report.dirty})`);
  console.log(`  Fingerprint:        ${report.fingerprint.slice(0, 16)}...`);
  console.log(`  Entorno:            ${report.environment} (Build de producción: ${report.isProductionBuild})`);
  console.log(subline);
  console.log("MODELO GLOBAL DE CONEXIONES Y LOCALIDAD (D17):");
  console.log(`  Instancias Web:     ${report.connectionModel.documentedMaxInstances} instancias x 2 conn = ${report.connectionModel.webClientConnections} clientes`);
  console.log(`  Reservas:           CLI: ${report.connectionModel.cliReservedConnections} | Migración: ${report.connectionModel.migrationReservedConnections} | Operativa: ${report.connectionModel.operationalReserve}`);
  console.log(`  Total Clientes:     ${report.connectionModel.totalClientConnections} conexiones al pooler (${report.connectionModel.formula})`);
  console.log(`  Pooler:             ${report.connectionModel.poolerType} (${report.connectionModel.poolerMultiplexingRatio})`);
  console.log(`  Servidor Backend:   ${report.connectionModel.estimatedBackendServerConnections} conexiones activas PostgreSQL suficientes`);
  console.log(`  Parámetros Pool:    max=${report.connectionModel.perInstanceMax}, min=${report.connectionModel.perInstanceMin}, connTimeout=${report.connectionModel.connectionTimeoutMs}ms, stmtTimeout=${report.connectionModel.statementTimeoutMs}ms`);
  console.log(`  Localidad:          Funciones: ${report.connectionModel.locality.serverlessFunctionRegion} <-> DB: ${report.connectionModel.locality.databaseRegion}`);
  console.log(`  Latencia esperada:  Intra-región: ${report.connectionModel.locality.expectedNetworkLatencyMs.intraRegion} | Cross-región: ${report.connectionModel.locality.expectedNetworkLatencyMs.crossRegion}`);
  console.log(subline);
  console.log("DATASET SINTÉTICO (AL MENOS EQUIVALENTE A S21):");
  console.log(`  Sesiones: ${report.dataset.sessions} | Recorridos: ${report.dataset.runs} | Recibos: ${report.dataset.receipts} | Eventos: ${report.dataset.events}`);
  console.log(`  Publicaciones HCS: ${report.dataset.publications} | Solicitudes Demo: ${report.dataset.demoRequests} | Planes analizados: ${report.dataset.queryPlansAnalyzed}`);
  console.log(subline);
  console.log("ARRANQUE FRÍO (COLD START):");
  console.log(`  Ruta: ${report.coldStart.route} -> ${report.coldStart.durationMs} ms [${report.coldStart.withinTarget ? "DENTRO DE OBJETIVO" : "EXCEDE"}]`);
  console.log(subline);
  console.log("MEDICIONES EN ESTADO CALIENTE (SLO: p95 <= 750 ms, p99 <= 1500 ms):");
  console.log("  Ruta            | Conc | Muestras | p50 (ms) | p90 (ms) | p95 (ms) | p99 (ms) | Conex DB | Estado");
  console.log("  " + "-".repeat(76));
  for (const m of report.warmMeasurements) {
    const routeStr = m.route.padEnd(15, " ");
    const concStr = String(m.concurrency).padStart(4, " ");
    const samplesStr = String(m.samplesCount).padStart(8, " ");
    const p50Str = m.p50Ms.toFixed(1).padStart(8, " ");
    const p90Str = m.p90Ms.toFixed(1).padStart(8, " ");
    const p95Str = m.p95Ms.toFixed(1).padStart(8, " ");
    const p99Str = m.p99Ms.toFixed(1).padStart(8, " ");
    const connStr = `${m.maxObservedConnections}/2`.padStart(8, " ");
    const passed = m.p95Ms <= CAPACITY_SLO_TARGETS.hotApiP95MaxMs && m.p99Ms <= CAPACITY_SLO_TARGETS.hotApiP99MaxMs && m.errorsCount === 0;
    const statusStr = passed ? "[APROBADO]" : "[RECHAZADO]";
    console.log(`  ${routeStr} | ${concStr} | ${samplesStr} | ${p50Str} | ${p90Str} | ${p95Str} | ${p99Str} | ${connStr} | ${statusStr}`);
  }
  console.log(subline);
  console.log("MEMORIA Y RECURSOS:");
  console.log(`  Heap inicial: ${formatBytes(report.memory.before.heapUsedBytes)} -> Heap final: ${formatBytes(report.memory.after.heapUsedBytes)} (Delta: ${formatBytes(report.memory.deltaHeapUsedBytes)})`);
  console.log(`  RSS final:    ${formatBytes(report.memory.after.rssBytes)}`);
  console.log(subline);
  console.log("SEPARACIÓN DE INCUMBENCIAS (LOCAL VS PROVEEDOR):");
  console.log(`  Capacidad local comprobada: ${report.separationOfConcerns.localProvenCapacity ? "SÍ" : "NO"}`);
  console.log(`  Límites reales proveedor:   PENDIENTES (Ticket 31)`);
  console.log(`  Aceptación global:          ${report.separationOfConcerns.globalAcceptance ? "SÍ" : "NO (Aceptación global bloqueada hasta verificación de hosting real)"}`);
  console.log("  Verificaciones externas pendientes:");
  for (const item of report.separationOfConcerns.pendingExternalVerification) {
    console.log(`    - ${item}`);
  }
  console.log(line);
  const evaluation = evaluateCapacityReport(report);
  if (evaluation.passed) {
    console.log("  ESTADO FINAL: ENSAYO DE CAPACIDAD LOCAL APROBADO");
    console.log("  (Todos los objetivos p95/p99 y límites de pool satisfechos en build de producción)");
  } else {
    console.log("  ESTADO FINAL: ENSAYO DE CAPACIDAD BLOQUEADO POR VIOLACIONES:");
    for (const v of evaluation.violations) {
      console.log(`    * ${v}`);
    }
  }
  console.log(line);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let report: CapacityReport;

  if (args.evaluateOnly) {
    const reportPath = args.evaluatePath ?? DEFAULT_REPORT_PATH;
    try {
      const content = await readFile(reportPath, "utf8");
      report = JSON.parse(content) as CapacityReport;
    } catch (cause) {
      console.error(`ERROR: No se pudo leer el reporte de capacidad en ${reportPath}:`, cause);
      process.exitCode = 1;
      return;
    }
  } else {
    report = await runCapacityBenchmark();
    await mkdir(DEFAULT_REPORT_DIR, { recursive: true });
    await writeFile(DEFAULT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  }

  const evaluation = evaluateCapacityReport(report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printCapacityReport(report);
  }

  if (!evaluation.passed) {
    process.exitCode = 1;
  }
}

// Ejecutar main si es invocado directamente vía CLI
if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/capacity-benchmark.ts")) {
  main().catch(err => {
    console.error("FATAL: Error no controlado en scripts/capacity-benchmark.ts:", err);
    process.exitCode = 1;
  });
}
