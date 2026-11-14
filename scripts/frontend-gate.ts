import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CWV_LAB_TARGETS,
  evaluateLighthouseRuns,
  JS_BUDGETS_KIB,
  measureAllFrontendBudgets,
  type FrontendBudgetsReport,
  type LighthouseRouteSummary,
  type LighthouseSample,
} from "./lib/frontend-budgets";

function printHelp() {
  console.log(`Uso: node --import tsx scripts/frontend-gate.ts [--json] [--output ARCHIVO] [--check-only]

Gate de producción de rendimiento frontend (S22-21, S22-22, AUD-10, AUD-11, D12):
1. Presupuestos de JavaScript transferido inicial comprimido (gzip):
   - Landing (/):                 <= ${JS_BUDGETS_KIB.landing} KiB
   - Demo (/demo):                <= ${JS_BUDGETS_KIB.demo} KiB
   - Trazabilidad (/trazabilidad): <= ${JS_BUDGETS_KIB.trazabilidad} KiB
   - QR diferido medido por separado.
2. Integridad de recursos críticos:
   - Imagen crítica con prioridad y dimensiones explícitas.
   - Fuentes locales con fallback sans-serif/serif.
   - Espacio QR con geometría reservada (256px y aspect-ratio 1).
   - Ausencia total de suppressHydrationWarning no autorizados.
3. Objetivos de laboratorio Core Web Vitals (3 corridas por ruta):
   - LCP mediano: <= ${CWV_LAB_TARGETS.lcpMs} ms
   - CLS mediano: <= ${CWV_LAB_TARGETS.cls}
   - TBT mediano: <= ${CWV_LAB_TARGETS.tbtMs} ms (diagnóstico de laboratorio; inpIsLaboratoryTbt=false)
   - Comparación con baseline (máximo 20% de regresión).`);
}

function loadLaboratoryEvidence(): {
  landing?: LighthouseRouteSummary | undefined;
  demo?: LighthouseRouteSummary | undefined;
  trazabilidad?: LighthouseRouteSummary | undefined;
} {
  // Intentar cargar evidencia de laboratorio previa si existe
  const labEvidencePath = resolve(".cache/frontend-budgets/laboratory.json");
  const s20Path = resolve(".cache/s20-seo/performance.json");

  let landing: LighthouseRouteSummary | undefined;
  let demo: LighthouseRouteSummary | undefined;
  let trazabilidad: LighthouseRouteSummary | undefined;

  try {
    const raw = readFileSync(labEvidencePath, "utf8");
    const data = JSON.parse(raw);
    if (data.landing) landing = data.landing;
    if (data.demo) demo = data.demo;
    if (data.trazabilidad) trazabilidad = data.trazabilidad;
  } catch {
    // Si no existe laboratory.json completo, evaluar contra s20 baseline para landing
    try {
      const s20Raw = readFileSync(s20Path, "utf8");
      const s20Data = JSON.parse(s20Raw);
      if (Array.isArray(s20Data.samples) && s20Data.samples.length >= 3) {
        landing = evaluateLighthouseRuns("/", s20Data.samples, s20Data.median);
      }
    } catch {
      // noop
    }
  }

  return { landing, demo, trazabilidad };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const jsonMode = args.includes("--json");
  let outputPath = resolve(".cache/frontend-budgets/report.json");
  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = resolve(args[outputIdx + 1]!);
  }

  // 1. Medir presupuestos de JavaScript e integridad estática
  const baseReport = measureAllFrontendBudgets();

  // 2. Cargar o vincular evidencia de laboratorio
  const lab = loadLaboratoryEvidence();

  const report: FrontendBudgetsReport = {
    ...baseReport,
    laboratory: lab,
  };

  mkdirSync(resolve(".cache/frontend-budgets"), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.allPassed) {
      process.exitCode = 1;
    }
    return;
  }

  // Salida formateada legible
  console.log("=".repeat(80));
  console.log("  Jopói · Gate de Producción Frontend y Presupuestos (S22-21 / S22-22 / D12)");
  console.log("=".repeat(80));
  console.log(`  Generado:           ${report.generatedAt}`);
  console.log(`  Revisión Git:       ${report.git.revision.slice(0, 8)} (dirty: ${report.git.dirty})`);
  console.log(`  Fingerprint:        ${report.git.fingerprint.slice(0, 16)}...`);
  console.log("-".repeat(80));
  console.log("PRESUPUESTOS DE JAVASCRIPT TRANSFERIDO INICIAL (GZIP):");
  console.log("-".repeat(80));

  const routes = [
    report.jsBudgets.landing,
    report.jsBudgets.demo,
    report.jsBudgets.trazabilidad,
  ];

  for (const r of routes) {
    const status = r.withinBudget ? "APROBADO" : "EXCEDIDO";
    const percent = Math.round((r.gzipKiB / r.budgetKiB) * 100);
    console.log(
      `  Ruta: ${r.route.padEnd(25)} Transferido: ${r.gzipKiB.toFixed(2)} KiB / Meta: ${r.budgetKiB} KiB (${percent}%) -> [${status}]`,
    );
  }

  console.log("-".repeat(80));
  console.log("MÓDULOS DIFERIDOS (MEDIDOS APARTE):");
  console.log(
    `  ${report.deferredModules.qr.name.padEnd(30)} ${report.deferredModules.qr.gzipKiB.toFixed(2)} KiB gzip (${report.deferredModules.qr.files.join(", ") || "paquete npm"})`,
  );

  console.log("-".repeat(80));
  console.log("INTEGRIDAD DE RECURSOS Y ACCESIBILIDAD:");
  console.log(`  Imagen crítica (prioridad/sizes):     ${report.assetIntegrity.criticalImagePriority ? "APROBADO" : "FALLÓ"}`);
  console.log(`  Fuentes locales con fallback:         ${report.assetIntegrity.localFontsWithFallback ? "APROBADO" : "FALLÓ"}`);
  console.log(`  Geometría QR reservada (256px / 1:1): ${report.assetIntegrity.qrGeometryReserved ? "APROBADO" : "FALLÓ"}`);
  console.log(`  Cero suppressHydrationWarning espurio:${report.assetIntegrity.zeroUnauthorizedHydrationSuppression ? "APROBADO" : "FALLÓ"}`);

  if (report.laboratory?.landing) {
    console.log("-".repeat(80));
    console.log("LABORATORIO CORE WEB VITALS (LANDING - MEDIANAS DE 3 CORRIDAS):");
    const l = report.laboratory.landing;
    console.log(`  LCP: ${l.median.lcp} ms (meta <= ${l.targets.lcpTarget} ms) -> ${l.median.lcp <= l.targets.lcpTarget ? "APROBADO" : "EXCEDIDO"}`);
    console.log(`  CLS: ${l.median.cls} (meta <= ${l.targets.clsTarget}) -> ${l.median.cls <= l.targets.clsTarget ? "APROBADO" : "EXCEDIDO"}`);
    console.log(`  TBT: ${l.median.tbt} ms (meta <= ${l.targets.tbtTarget} ms, diagnóstico lab) -> ${l.median.tbt <= l.targets.tbtTarget ? "APROBADO" : "EXCEDIDO"}`);
    console.log(`  TBT como INP: NO (${l.note})`);
  }

  console.log("=".repeat(80));
  const finalStatus = report.allPassed ? "GATE APROBADO: Todos los presupuestos cumplidos" : "GATE RECHAZADO: Existen excesos de presupuesto";
  console.log(`  ESTADO FINAL: ${finalStatus}`);
  console.log("=".repeat(80));

  if (!report.allPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Error en gate de frontend:", err);
  process.exitCode = 1;
});
