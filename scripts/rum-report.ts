import { writeFileSync } from "node:fs";
import { generateRumReport } from "../src/server/monitoring/rum";
import { RUM_MIN_SAMPLE_COUNT } from "../src/shared/rum-contracts";

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Uso: node --import tsx scripts/rum-report.ts [--json] [--min-samples N] [--output ARCHIVO]
Genera el informe de telemetría RUM (Real User Monitoring) de visitantes.
Evalúa p75 de LCP, INP y CLS en ventana móvil de 28 días por ruta plantilla y dispositivo.
Exige al menos 200 muestras válidas por cohorte (AUD-11).`);
    return;
  }

  let minSamples = RUM_MIN_SAMPLE_COUNT;
  const minSamplesIdx = args.indexOf("--min-samples");
  if (minSamplesIdx !== -1 && args[minSamplesIdx + 1]) {
    const parsed = parseInt(args[minSamplesIdx + 1]!, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      minSamples = parsed;
    }
  }

  const report = generateRumReport(new Date(), minSamples);

  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    writeFileSync(args[outputIdx + 1]!, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Informe guardado en ${args[outputIdx + 1]}`);
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=".repeat(80));
  console.log("  Jopói · Informe RUM de Rendimiento Real (Core Web Vitals p75)");
  console.log("=".repeat(80));
  console.log(`  Generado:               ${report.generatedAt}`);
  console.log(`  Ventana móvil:          ${report.windowDays} días`);
  console.log(`  Mínimo por cohorte:     ${report.minSamplesRequired} muestras requeridas`);
  console.log(`  TBT como INP:           NO (INP de campo real: ${report.inpIsLaboratoryTbt ? "falso" : "verdadero"})`);
  console.log(`  Cohortes evaluadas:     ${report.summary.totalCohorts}`);
  console.log(`  Cohortes suficientes:   ${report.summary.sufficientCohorts}`);
  console.log(`  Cohortes conformes:     ${report.summary.passingCohorts}`);
  console.log(
    `  Cumplimiento global:    ${
      report.summary.overallCompliant === null
        ? "INSUFICIENTE (faltan muestras de campo)"
        : report.summary.overallCompliant
          ? "CONFORME"
          : "REGRESIÓN"
    }`,
  );
  console.log("-".repeat(80));

  console.log(
    sprintf(
      "%-25s %-10s %-6s %-8s %-8s %-8s %-12s %s",
      "Ruta",
      "Dispositivo",
      "Métrica",
      "Muestras",
      "p75",
      "Meta",
      "Estado",
      "Evaluación",
    ),
  );
  console.log("-".repeat(80));

  for (const c of report.cohorts) {
    if (c.sampleCount === 0 && !args.includes("--all")) {
      continue;
    }
    const p75Str = c.p75 !== null ? (c.metric === "CLS" ? c.p75.toFixed(2) : `${c.p75} ms`) : "s/d";
    const targetStr = c.metric === "CLS" ? c.target.toFixed(2) : `${c.target} ms`;
    console.log(
      sprintf(
        "%-25s %-10s %-6s %-8d %-8s %-8s %-12s %s",
        c.route,
        c.device,
        c.metric,
        c.sampleCount,
        p75Str,
        targetStr,
        c.status === "SUFFICIENT_DATA" ? "SUFICIENTE" : "INSUFICIENTE",
        c.rating,
      ),
    );
  }

  console.log("=".repeat(80));
}

function sprintf(format: string, ...args: (string | number)[]): string {
  let i = 0;
  return format.replace(/%(-?\d+)?([sd])/g, (_, widthStr, type) => {
    const val = args[i++];
    let str = type === "d" ? String(Math.round(Number(val))) : String(val ?? "");
    if (widthStr) {
      const width = parseInt(widthStr, 10);
      if (width < 0) {
        str = str.padEnd(-width, " ");
      } else {
        str = str.padStart(width, " ");
      }
    }
    return str;
  });
}

main();
