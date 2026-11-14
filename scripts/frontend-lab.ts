import { createServer } from "node:net";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import {
  CWV_LAB_TARGETS,
  evaluateLighthouseRuns,
  type LighthouseRouteSummary,
  type LighthouseSample,
} from "./lib/frontend-budgets";
import { evidenceRevision } from "./lib/evidence";

async function freePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("PORT_UNAVAILABLE");
      server.close(() => resolvePort(address.port));
    });
  });
}

const ROUTES = [
  { name: "landing", path: "/", targetLcp: 2500, targetCls: 0.10, targetTbt: 250 },
  { name: "demo", path: "/demo", targetLcp: 2500, targetCls: 0.10, targetTbt: 250 },
  { name: "trazabilidad", path: "/trazabilidad/00000000-0000-4000-8000-000000000000", targetLcp: 2500, targetCls: 0.10, targetTbt: 250 },
] as const;

async function main() {
  const args = process.argv.slice(2);
  let baseUrl = "http://127.0.0.1:3000";
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    baseUrl = args[urlIdx + 1]!;
  }

  console.log(`Iniciando evaluación de laboratorio Lighthouse (S22-22) en ${baseUrl}...`);
  console.log("Perfil: Lighthouse default mobile, simulated throttling, headless Chromium.");

  const debugPort = await freePort();
  const measurementBrowser = await chromium.launch({
    args: [`--remote-debugging-port=${debugPort}`],
  });

  const cacheDir = resolve(".cache/frontend-budgets");
  mkdirSync(cacheDir, { recursive: true });

  const summaries: Record<string, LighthouseRouteSummary> = {};
  let allRoutesPassed = true;

  try {
    for (const r of ROUTES) {
      const fullUrl = `${baseUrl}${r.path}`;
      console.log(`\n--- Evaluando ruta: ${r.name} (${r.path}) ---`);

      const samples: LighthouseSample[] = [];

      for (let run = 1; run <= 3; run++) {
        process.stdout.write(`  Corrida ${run}/3... `);
        const report = await lighthouse(fullUrl, {
          port: debugPort,
          onlyCategories: ["performance"],
          output: "json",
          logLevel: "error",
          formFactor: "mobile",
          throttlingMethod: "simulate",
        });

        if (!report || report.lhr.runtimeError) {
          throw new Error(`Lighthouse falló en ${fullUrl} corrida ${run}: ${report?.lhr.runtimeError?.message}`);
        }

        const metric = (id: string) => {
          const val = report.lhr.audits[id]?.numericValue;
          if (val === undefined || !Number.isFinite(val) || val < 0) {
            throw new Error(`Métrica faltante en Lighthouse: ${id}`);
          }
          return val;
        };

        const category = report.lhr.categories.performance;
        const lcp = metric("largest-contentful-paint");
        const cls = metric("cumulative-layout-shift");
        const tbt = metric("total-blocking-time");
        const score = category?.score ?? null;

        samples.push({ run, lcp, cls, tbt, score });
        console.log(`LCP: ${Math.round(lcp)} ms | CLS: ${cls.toFixed(3)} | TBT: ${Math.round(tbt)} ms`);

        writeFileSync(
          resolve(cacheDir, `lighthouse-${r.name}-run-${run}.json`),
          JSON.stringify(report.lhr, null, 2),
        );
      }

      // Cargar baseline de s20 para landing si existe
      let baseline: { lcp: number; cls: number; tbt: number } | undefined;
      if (r.name === "landing") {
        try {
          const s20 = JSON.parse(readFileSync(".cache/s20-seo/performance.json", "utf8"));
          if (s20.median) baseline = s20.median;
        } catch {
          // noop
        }
      }

      const summary = evaluateLighthouseRuns(r.path, samples, baseline);
      summaries[r.name] = summary;

      console.log(`  -> Mediana ${r.name}: LCP ${summary.median.lcp} ms, CLS ${summary.median.cls}, TBT ${summary.median.tbt} ms`);
      console.log(`  -> Cumple metas S22: ${summary.withinTargets ? "SÍ" : "NO"}`);
      if (!summary.withinTargets) allRoutesPassed = false;
    }
  } finally {
    await measurementBrowser.close();
  }

  const outputPayload = {
    generatedAt: new Date().toISOString(),
    ...evidenceRevision(),
    profile: "Lighthouse mobile simulated throttling (3 corridas por ruta)",
    targets: CWV_LAB_TARGETS,
    allRoutesPassed,
    inpIsLaboratoryTbt: false,
    note: "TBT es diagnóstico de laboratorio y NO equivale ni aprueba INP de campo.",
    routes: summaries,
  };

  writeFileSync(
    resolve(cacheDir, "laboratory.json"),
    JSON.stringify(outputPayload, null, 2),
  );

  console.log("\n" + "=".repeat(80));
  console.log(`RESULTADO DE LABORATORIO: ${allRoutesPassed ? "APROBADO" : "RECHAZADO"}`);
  console.log(`Evidencia guardada en: .cache/frontend-budgets/laboratory.json`);
  console.log("=".repeat(80));

  if (!allRoutesPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Error en evaluación de laboratorio:", err);
  process.exitCode = 1;
});
