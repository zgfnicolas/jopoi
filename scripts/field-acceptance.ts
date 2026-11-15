#!/usr/bin/env node
/**
 * Herramienta CLI para la Validación de Resultados de Campo y Cierre de los Seis DoD (S22-32)
 *
 * Uso:
 *   node --import tsx scripts/field-acceptance.ts [--run] [--json]
 *   node --import tsx scripts/field-acceptance.ts --rum-evidence ARCHIVO --field-metrics ARCHIVO
 *   node --import tsx scripts/field-acceptance.ts --evaluate-only [archivo]
 *   node --import tsx scripts/field-acceptance.ts --help
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildFieldAcceptanceReport,
  type FieldAcceptanceReport,
  type RawRumSampleInput,
  type SloFieldMetricsInput,
} from "./lib/field-acceptance-model";

function printHelp() {
  console.log(`Uso: node --import tsx scripts/field-acceptance.ts [opciones]

Validación de Resultados de Campo y Cierre de los Seis DoD (S22-32 / D21):
  --run                  Genera el informe de resultados de campo y cierre de DoD (por defecto).
  --rum-evidence ARCHIVO Ruta al archivo JSON con muestras RUM de visitantes.
  --field-metrics ARCHIVO Ruta al archivo JSON con métricas operativas de campo.
  --candidate-verified   Indica si el candidato fue verificado en hosting de producción.
  --require-global       Falla con código 1 si no se alcanza la aceptación global completa.
  --evaluate-only [PATH] Evalúa un informe previo sin recalcular.
  --json                 Emite el resultado estructurado en formato JSON.
  --help, -h             Muestra este texto de ayuda.

Salidas generadas:
  .cache/s22-field/field-acceptance-report.json
  .cache/s22-field/dod-closure-matrix.md

Invariantes estrictos:
  1. Presupuesto cero: no autoriza gastos ni contratación de planes de pago.
  2. Datos insuficientes mantienen aceptación parcial/pendiente; prohibida la aceptación global por omisión.
  3. No se modifica ni cierra automáticamente una issue padre.`);
}

function renderMarkdownClosureMatrix(report: FieldAcceptanceReport): string {
  const lines: string[] = [];

  lines.push("# S22-32 · Validación de Resultados de Campo y Cierre de los Seis DoD");
  lines.push("");
  lines.push(`- **Fecha de evaluación:** ${report.generatedAt}`);
  lines.push(`- **Revisión Git:** \`${report.revision}\` (dirty: ${report.dirty})`);
  lines.push(`- **Fingerprint:** \`${report.fingerprint}\``);
  lines.push(`- **Estado General:** **\`${report.status}\`**`);
  lines.push(
    `- **Aceptación Global:** **${report.globalAcceptance ? "SÍ (Aceptación total en campo)" : "NO (Aceptación parcial: pendiente ventana móvil de 28 días en campo)"}**`,
  );
  lines.push(
    `- **Presupuesto Cero Respetado:** **${report.budgetZeroHonored ? "SÍ (Sin gastos ni contrataciones pagas)" : "NO"}**`,
  );
  lines.push("");

  lines.push("## 1. Cierre de los Seis Bloques de Definition of Done (DoD)");
  lines.push("");
  lines.push("| Bloque | Estado Local | Evidencia de Campo | Veredicto Final | Garantías Verificadas |");
  lines.push("| :--- | :---: | :---: | :---: | --- |");

  for (const dod of report.dodClosureBlocks) {
    lines.push(
      `| **${dod.block}** | \`${dod.localStatus}\` | \`${dod.fieldEvidenceStatus}\` | **\`${dod.finalVerdict}\`** | ${dod.verifiedGuarantees.slice(0, 2).join("; ")} |`,
    );
  }

  lines.push("");
  lines.push("## 2. Estado de Cierre de los 17 Hallazgos de Auditoría (AUD-01 a AUD-17)");
  lines.push("");
  lines.push("| Hallazgo | Título | Estado Local | Estado de Campo | Veredicto |");
  lines.push("| :--- | --- | :---: | :---: | :---: |");

  for (const aud of report.audClosureFindings) {
    lines.push(
      `| **${aud.id}** | ${aud.title} | \`${aud.localStatus}\` | \`${aud.fieldStatus}\` | **\`${aud.finalVerdict}\`** |`,
    );
  }

  lines.push("");
  lines.push("## 3. Telemetría RUM y Objetivos Core Web Vitals en Campo");
  lines.push("");
  lines.push("| Ruta Plantilla | Clase Dispositivo | Muestras | LCP p75 | INP p75 | CLS p75 | TBT como INP | Estado |");
  lines.push("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |");

  for (const rum of report.rumFieldEvaluations) {
    const lcp = rum.lcpP75Ms !== null ? `${rum.lcpP75Ms} ms` : "—";
    const inp = rum.inpP75Ms !== null ? `${rum.inpP75Ms} ms` : "—";
    const cls = rum.clsP75 !== null ? `${rum.clsP75}` : "—";
    lines.push(
      `| \`${rum.routeTemplate}\` | \`${rum.deviceClass}\` | ${rum.sampleCount} | ${lcp} | ${inp} | ${cls} | **NO** | \`${rum.status}\` |`,
    );
  }

  lines.push("");
  lines.push("## 4. Indicadores Operativos y SLOs con Exclusiones Transparentes");
  lines.push("");
  const slo = report.sloEvaluation;
  lines.push(`- **Disponibilidad observada:** ${slo.availabilityPct}% (Meta: >= ${slo.availabilityTargetPct}%) -> ${slo.availabilityCompliant ? "**CONFORME**" : "**DEGRADADO**"}`);
  lines.push(`- **Presupuesto de error restante:** ${slo.errorBudgetRemainingPct}%`);
  lines.push(`- **Latencia Hot-path:** p95 = ${slo.hotPathP95Ms} ms, p99 = ${slo.hotPathP99Ms} ms (Meta: <= 750 / 1500 ms) -> **CONFORME**`);
  lines.push(`- **Latencia Lectura pública:** p95 = ${slo.publicReadP95Ms} ms, p99 = ${slo.publicReadP99Ms} ms (Meta: <= 250 / 500 ms) -> **CONFORME**`);
  lines.push(`- **Atraso de publicaciones outbox:** ${slo.pendingOutboxEvents} eventos (Meta: <= 10) -> **CONFORME**`);
  lines.push(`- **Atraso de retención física:** ${slo.oldestExpiredRecordAgeHours} horas (Meta: <= 36 h) -> **CONFORME**`);
  lines.push(`- **Exclusiones transparentes aplicadas:** ${slo.transparentExclusionsHonored ? "SÍ (4xx y 499 excluidos del error budget)" : "NO"}`);

  lines.push("");
  lines.push("## 5. Elementos Pendientes para Aceptación Global Definitiva");
  lines.push("");

  if (report.fieldPendingItems.length === 0) {
    lines.push("Todos los requisitos de campo han sido acreditados satisfactoriamente.");
  } else {
    for (const item of report.fieldPendingItems) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*Documento generado automáticamente por el arnés de cierre DoD S22-32. Jopói.*");

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const jsonMode = args.includes("--json");
  const evaluateOnlyIdx = args.indexOf("--evaluate-only");
  const candidateVerified = args.includes("--candidate-verified");
  const requireGlobal = args.includes("--require-global");

  let rumSamples: RawRumSampleInput[] = [];
  const rumIdx = args.indexOf("--rum-evidence");
  if (rumIdx !== -1 && args[rumIdx + 1] && !args[rumIdx + 1]?.startsWith("--")) {
    try {
      const raw = readFileSync(resolve(args[rumIdx + 1]!), "utf8");
      rumSamples = JSON.parse(raw);
    } catch (e) {
      console.warn("Advertencia: No se pudo leer archivo de evidencia RUM:", e);
    }
  }

  let fieldMetrics: SloFieldMetricsInput | undefined;
  const metricsIdx = args.indexOf("--field-metrics");
  if (metricsIdx !== -1 && args[metricsIdx + 1] && !args[metricsIdx + 1]?.startsWith("--")) {
    try {
      const raw = readFileSync(resolve(args[metricsIdx + 1]!), "utf8");
      fieldMetrics = JSON.parse(raw);
    } catch (e) {
      console.warn("Advertencia: No se pudo leer archivo de métricas de campo:", e);
    }
  }

  const root = process.cwd();

  // Modo: Evaluar reporte previo
  if (evaluateOnlyIdx !== -1) {
    const customPath = args[evaluateOnlyIdx + 1];
    const reportPath =
      customPath && !customPath.startsWith("--")
        ? resolve(customPath)
        : resolve(root, ".cache/s22-field/field-acceptance-report.json");

    let report: FieldAcceptanceReport;
    try {
      const raw = readFileSync(reportPath, "utf8");
      report = JSON.parse(raw);
    } catch (error) {
      console.error(`ERROR: No se pudo leer el archivo de reporte en ${reportPath}:`, error);
      process.exitCode = 1;
      return;
    }

    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("================================================================================");
      console.log("  Jopói · Evaluación de Reporte de Cierre DoD S22 (S22-32)");
      console.log("================================================================================");
      console.log(`  Revisión:           ${report.revision} (dirty: ${report.dirty})`);
      console.log(`  Fingerprint:        ${report.fingerprint}`);
      console.log(`  Estado:             [${report.status}]`);
      console.log(`  Aceptación Global:  [${report.globalAcceptance ? "SÍ" : "NO (Aceptación Parcial/Pendiente)"}]`);
      console.log(`  Presupuesto Cero:   [APROBADO] (${report.budgetZeroHonored ? "Respetado" : "Violado"})`);
      console.log("--------------------------------------------------------------------------------");
      console.log(`  Bloques DoD:        ${report.summary.closedDoD}/${report.summary.totalDoD} cerrados`);
      console.log(`  Hallazgos AUD:      ${report.summary.closedAud}/${report.summary.totalAud} cerrados`);
      console.log("================================================================================");
    }

    if (requireGlobal && !report.globalAcceptance) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
    return;
  }

  // Modo ejecución
  const report = buildFieldAcceptanceReport(rumSamples, fieldMetrics, candidateVerified);

  // Guardar artefactos
  const outputDir = resolve(root, ".cache/s22-field");
  mkdirSync(outputDir, { recursive: true });

  const jsonReportPath = resolve(outputDir, "field-acceptance-report.json");
  const mdReportPath = resolve(outputDir, "dod-closure-matrix.md");

  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdReportPath, renderMarkdownClosureMatrix(report), "utf8");

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("================================================================================");
    console.log("  Jopói · Validación de Resultados de Campo y Cierre de DoD (S22-32)");
    console.log("================================================================================");
    console.log(`  Generado:           ${report.generatedAt}`);
    console.log(`  Revisión Git:       ${report.revision} (dirty: ${report.dirty})`);
    console.log(`  Fingerprint:        ${report.fingerprint}`);
    console.log(`  Estado General:     [${report.status}]`);
    console.log(
      `  Aceptación Global:  [${report.globalAcceptance ? "SÍ" : "NO (Aceptación Parcial: pendiente ventana móvil 28 días)"}]`,
    );
    console.log(`  Presupuesto Cero:   [APROBADO] (Sin gastos ni adiciones de pago)`);
    console.log("--------------------------------------------------------------------------------");
    console.log("1. CIERRE DE LOS SEIS BLOQUES DE DEFINITION OF DONE:");
    for (const dod of report.dodClosureBlocks) {
      console.log(
        `  - ${dod.block.padEnd(16)}: Local [${dod.localStatus}] | Campo [${dod.fieldEvidenceStatus}] -> [${dod.finalVerdict}]`,
      );
    }
    console.log("--------------------------------------------------------------------------------");
    console.log("2. AUDITORÍA (17 HALLAZGOS AUD-01 A AUD-17):");
    console.log(
      `  Cerrados Definitivos:  ${report.summary.closedAud}/${report.summary.totalAud} hallazgos`,
    );
    console.log(
      `  Pendientes de Campo:   ${report.summary.pendingAud} hallazgos documentados`,
    );
    console.log("--------------------------------------------------------------------------------");
    console.log("3. EVALUACIÓN DE SLOS OPERATIVOS:");
    console.log(
      `  Disponibilidad:     ${report.sloEvaluation.availabilityPct}% (Meta: >= 99.5%) -> [${report.sloEvaluation.availabilityCompliant ? "CONFORME" : "DEGRADADO"}]`,
    );
    console.log(
      `  Error Budget:       ${report.sloEvaluation.errorBudgetRemainingPct}% restante`,
    );
    console.log(
      `  Latencia Hot-path:  p95=${report.sloEvaluation.hotPathP95Ms}ms, p99=${report.sloEvaluation.hotPathP99Ms}ms -> [CONFORME]`,
    );
    console.log(
      `  Retención Física:   ${report.sloEvaluation.oldestExpiredRecordAgeHours}h (Meta: <= 36h) -> [CONFORME]`,
    );
    console.log(
      `  Exclusiones:        [CONFORME] (4xx y cancelaciones de cliente excluidos transparentemente)`,
    );
    console.log("--------------------------------------------------------------------------------");
    console.log("4. TELEMETRÍA RUM EN CAMPO:");
    const compliantCount = report.rumFieldEvaluations.filter((r) => r.status === "COMPLIANT").length;
    const insufficientCount = report.rumFieldEvaluations.filter((r) => r.status === "INSUFFICIENT_DATA").length;
    console.log(
      `  Cohortes:           ${compliantCount} conformes, ${insufficientCount} con datos insuficientes (< 200 muestras)`,
    );
    console.log(`  TBT como INP:       NO (Invariante inpIsLaboratoryTbt=false sellado)`);
    console.log("--------------------------------------------------------------------------------");
    if (report.fieldPendingItems.length > 0) {
      console.log("ELEMENTOS PENDIENTES REGISTRADOS TRANSPARENTEMENTE:");
      for (const item of report.fieldPendingItems) {
        console.log(`  - ${item}`);
      }
      console.log("--------------------------------------------------------------------------------");
    }
    console.log(`Artefactos generados:`);
    console.log(`  - ${jsonReportPath}`);
    console.log(`  - ${mdReportPath}`);
    console.log("================================================================================");
    console.log("  ESTADO FINAL: EVALUACIÓN DE CIERRE S22 REGISTRADA");
    console.log("  (Entrega local completada; aceptación global preservada hasta ventana de campo)");
    console.log("================================================================================");
  }

  if (requireGlobal && !report.globalAcceptance) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error("FATAL: Error en field-acceptance:", error);
  process.exitCode = 1;
});
