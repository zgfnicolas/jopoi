import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  calculateMedian,
  CWV_LAB_TARGETS,
  evaluateLighthouseRuns,
  extractPageInitialScripts,
  JS_BUDGETS_KIB,
  measureAllFrontendBudgets,
  measureChunkFiles,
  verifyAssetIntegrity,
  type LighthouseSample,
} from "../../scripts/lib/frontend-budgets";
import { THEME_BOOTSTRAP_HASH } from "../../src/server/security/headers";

test("S22-22 / AUD-11: Presupuestos de JS transferido comprimido (landing 200, demo 300, trazabilidad 250 KiB)", () => {
  const report = measureAllFrontendBudgets();

  // 1. Landing (<= 200 KiB)
  assert.equal(report.jsBudgets.landing.budgetKiB, JS_BUDGETS_KIB.landing);
  assert.ok(
    report.jsBudgets.landing.gzipKiB <= 200,
    `Landing excedió 200 KiB: ${report.jsBudgets.landing.gzipKiB} KiB`,
  );
  assert.equal(report.jsBudgets.landing.withinBudget, true);

  // 2. Demo (<= 300 KiB)
  assert.equal(report.jsBudgets.demo.budgetKiB, JS_BUDGETS_KIB.demo);
  assert.ok(
    report.jsBudgets.demo.gzipKiB <= 300,
    `Demo excedió 300 KiB: ${report.jsBudgets.demo.gzipKiB} KiB`,
  );
  assert.equal(report.jsBudgets.demo.withinBudget, true);

  // 3. Trazabilidad (<= 250 KiB)
  assert.equal(report.jsBudgets.trazabilidad.budgetKiB, JS_BUDGETS_KIB.trazabilidad);
  assert.ok(
    report.jsBudgets.trazabilidad.gzipKiB <= 250,
    `Trazabilidad excedió 250 KiB: ${report.jsBudgets.trazabilidad.gzipKiB} KiB`,
  );
  assert.equal(report.jsBudgets.trazabilidad.withinBudget, true);

  // 4. Módulo QR medido aparte como carga diferida
  assert.ok(
    report.deferredModules.qr.gzipKiB > 0,
    "El módulo QR diferido debe reportar tamaño medible",
  );
  assert.ok(
    report.deferredModules.qr.gzipKiB <= 50,
    `El módulo QR diferido no debería superar 50 KiB: ${report.deferredModules.qr.gzipKiB} KiB`,
  );

  assert.equal(report.allPassed, true);
});

test("S22-22 / AUD-11: Extractor de scripts distingue navegadores modernos de polyfills nomodule", () => {
  const syntheticHtml = `
    <!DOCTYPE html><html><head>
      <script src="/_next/static/chunks/main-chunk.js" async=""></script>
      <script src="/_next/static/chunks/framework.js" async=""></script>
      <script src="/_next/static/chunks/legacy-polyfills.js" noModule=""></script>
      <script src="https://external.invalid/tracker.js"></script>
    </head><body></body></html>
  `;

  const extracted = extractPageInitialScripts(syntheticHtml);
  assert.deepEqual(extracted.modernScripts, [
    "/_next/static/chunks/main-chunk.js",
    "/_next/static/chunks/framework.js",
  ]);
  assert.deepEqual(extracted.legacyPolyfills, [
    "/_next/static/chunks/legacy-polyfills.js",
  ]);
});

test("S22-22 / AUD-11: Evaluación de laboratorio Core Web Vitals (medianas de 3 corridas: LCP <= 2.5s, CLS <= 0.1, TBT <= 250ms)", () => {
  // 1. Muestras conformes
  const passingSamples: LighthouseSample[] = [
    { run: 1, lcp: 938, cls: 0.01, tbt: 210, score: 0.98 },
    { run: 2, lcp: 950, cls: 0.02, tbt: 235, score: 0.96 },
    { run: 3, lcp: 920, cls: 0.00, tbt: 65, score: 1.00 },
  ];

  const summary = evaluateLighthouseRuns("/", passingSamples, {
    lcp: 938,
    cls: 0,
    tbt: 235,
  });

  assert.equal(summary.median.lcp, 938);
  assert.equal(summary.median.cls, 0.01);
  assert.equal(summary.median.tbt, 210);
  assert.equal(summary.withinTargets, true);
  assert.equal(summary.inpIsLaboratoryTbt, false);
  assert.ok(summary.note.includes("TBT es diagnóstico de laboratorio"));

  // 2. Muestras con LCP excedido (> 2500 ms)
  const lcpFailedSamples: LighthouseSample[] = [
    { run: 1, lcp: 2600, cls: 0.01, tbt: 100, score: 0.7 },
    { run: 2, lcp: 2700, cls: 0.01, tbt: 120, score: 0.7 },
    { run: 3, lcp: 2800, cls: 0.01, tbt: 110, score: 0.65 },
  ];
  const lcpSummary = evaluateLighthouseRuns("/", lcpFailedSamples);
  assert.equal(lcpSummary.withinTargets, false);

  // 3. Muestras con CLS excedido (> 0.10)
  const clsFailedSamples: LighthouseSample[] = [
    { run: 1, lcp: 900, cls: 0.15, tbt: 100, score: 0.8 },
    { run: 2, lcp: 950, cls: 0.12, tbt: 120, score: 0.85 },
    { run: 3, lcp: 920, cls: 0.14, tbt: 110, score: 0.82 },
  ];
  const clsSummary = evaluateLighthouseRuns("/demo", clsFailedSamples);
  assert.equal(clsSummary.withinTargets, false);

  // 4. Muestras con TBT excedido (> 250 ms)
  const tbtFailedSamples: LighthouseSample[] = [
    { run: 1, lcp: 900, cls: 0.01, tbt: 320, score: 0.8 },
    { run: 2, lcp: 950, cls: 0.01, tbt: 280, score: 0.85 },
    { run: 3, lcp: 920, cls: 0.01, tbt: 310, score: 0.82 },
  ];
  const tbtSummary = evaluateLighthouseRuns("/trazabilidad/:traceId", tbtFailedSamples);
  assert.equal(tbtSummary.withinTargets, false);

  // 5. Rechazo ante menos de 3 corridas
  assert.throws(
    () => evaluateLighthouseRuns("/", passingSamples.slice(0, 2)),
    /al menos 3 corridas/,
  );
});

test("S22-22 / AUD-11: Comparación de regresión vs baseline comparable (límite 20%)", () => {
  const baseline = { lcp: 1000, cls: 0.02, tbt: 150 };

  // Regresión de 15% (1150 ms <= 1200 ms) -> Aceptable dentro del margen
  const acceptableSamples: LighthouseSample[] = [
    { run: 1, lcp: 1140, cls: 0.02, tbt: 160, score: 0.95 },
    { run: 2, lcp: 1150, cls: 0.02, tbt: 150, score: 0.95 },
    { run: 3, lcp: 1160, cls: 0.02, tbt: 155, score: 0.94 },
  ];
  const acceptable = evaluateLighthouseRuns("/", acceptableSamples, baseline);
  assert.equal(acceptable.withinTargets, true);
  assert.equal(acceptable.baselineComparison?.withinBaselineThreshold, true);

  // Regresión severa de 35% en valor alto (baseline 1800 -> new 2450 ms: ratio = 1.36 > 1.20)
  const highBaseline = { lcp: 1800, cls: 0.02, tbt: 150 };
  const regressedSamples: LighthouseSample[] = [
    { run: 1, lcp: 2440, cls: 0.02, tbt: 160, score: 0.85 },
    { run: 2, lcp: 2450, cls: 0.02, tbt: 150, score: 0.85 },
    { run: 3, lcp: 2460, cls: 0.02, tbt: 155, score: 0.84 },
  ];
  const regressed = evaluateLighthouseRuns("/", regressedSamples, highBaseline);
  assert.equal(regressed.withinTargets, false);
  assert.equal(regressed.baselineComparison?.withinBaselineThreshold, false);
});

test("S22-21 / AUD-10: Integridad de imagen crítica, fuentes locales, geometría QR y skeletons", () => {
  const integrity = verifyAssetIntegrity();

  // 1. Imagen crítica en HomePage
  assert.equal(integrity.criticalImagePriority, true);
  const homeCode = readFileSync("src/app/page.tsx", "utf8");
  assert.ok(homeCode.includes("chipsPhoto"));
  assert.ok(homeCode.includes("sizes="));
  assert.ok(homeCode.includes("preload") || homeCode.includes("priority"));

  // 2. Fuentes locales y fallbacks
  assert.equal(integrity.localFontsWithFallback, true);
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes("font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;"));
  assert.ok(css.includes("font-family: var(--font-heading), \"Arial Narrow\", sans-serif;"));

  // 3. Geometría QR reservada (256px y aspect-ratio 1)
  assert.equal(integrity.qrGeometryReserved, true);
  const qrCss = readFileSync("src/components/trace-share.module.css", "utf8");
  assert.ok(qrCss.includes("width: 256px;"));
  assert.ok(qrCss.includes("aspect-ratio: 1;"));
});

test("S22-21 / AUD-10: Cero suppressHydrationWarning no autorizados para ocultar fallos", () => {
  const integrity = verifyAssetIntegrity();
  assert.equal(integrity.zeroUnauthorizedHydrationSuppression, true);

  // Verificación exhaustiva: escanear todo src/components
  const componentFiles = readdirSync("src/components");
  for (const file of componentFiles) {
    if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      const content = readFileSync(join("src/components", file), "utf8");
      assert.equal(
        content.includes("suppressHydrationWarning"),
        false,
        `Prohibido suppressHydrationWarning en componente de contenido: ${file}`,
      );
    }
  }

  // En src/app, solo se permite en el tag <html> para el script síncrono THEME_BOOTSTRAP
  const appFiles = readdirSync("src/app");
  for (const file of appFiles) {
    if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      const content = readFileSync(join("src/app", file), "utf8");
      if (content.includes("suppressHydrationWarning")) {
        assert.ok(
          file === "layout.tsx" || file === "global-error.tsx",
          `suppressHydrationWarning inesperado en ${file}`,
        );
        assert.ok(
          content.includes("<html") && content.includes("suppressHydrationWarning"),
          `suppressHydrationWarning solo se autoriza en la etiqueta <html ...>`,
        );
      }
    }
  }
});

test("S22-15 / D09: Theme bootstrap síncrono sin hidratación mismatch y compatible con hash CSP", () => {
  // Comprobar que THEME_BOOTSTRAP_HASH existe y es un hash sha256 no vacío
  assert.ok(typeof THEME_BOOTSTRAP_HASH === "string");
  assert.ok(THEME_BOOTSTRAP_HASH.startsWith("sha256-"));

  // Comprobar que RootLayout incluye el script síncrono antes del body
  const layoutCode = readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(layoutCode.includes("THEME_BOOTSTRAP"));
  assert.ok(layoutCode.includes("dangerouslySetInnerHTML"));
});

test("S22-22 / AUD-11: CLI scripts/frontend-gate.ts emite reporte completo y bloquea ante excesos", () => {
  const nodeBinary = process.execPath;

  const result = spawnSync(
    nodeBinary,
    ["--import", "tsx", "scripts/frontend-gate.ts", "--json"],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 25000,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.allPassed, true);
  assert.equal(parsed.jsBudgets.landing.withinBudget, true);
  assert.equal(parsed.jsBudgets.demo.withinBudget, true);
  assert.equal(parsed.jsBudgets.trazabilidad.withinBudget, true);
  assert.equal(parsed.assetIntegrity.criticalImagePriority, true);
  assert.equal(parsed.assetIntegrity.localFontsWithFallback, true);
  assert.equal(parsed.assetIntegrity.qrGeometryReserved, true);
  assert.equal(parsed.assetIntegrity.zeroUnauthorizedHydrationSuppression, true);
});
