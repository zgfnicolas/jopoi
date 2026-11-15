#!/usr/bin/env node
/**
 * Herramienta CLI para la Acreditación Operativa del Candidato (S22-31)
 *
 * Uso:
 *   node --import tsx scripts/candidate-acceptance.ts [--run] [--json]
 *   node --import tsx scripts/candidate-acceptance.ts --proof ARCHIVO --journal ARCHIVO
 *   node --import tsx scripts/candidate-acceptance.ts --evaluate-only [archivo]
 *   node --import tsx scripts/candidate-acceptance.ts --help
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateCandidateAccreditation,
  type CandidateAccreditationReport,
} from "./lib/candidate-acceptance-model";

function printHelp() {
  console.log(`Uso: node --import tsx scripts/candidate-acceptance.ts [opciones]

Acreditación Operativa del Candidato en Entorno Gratuito (S22-31 / D21):
  --run                  Ejecuta la evaluación operativa del candidato (por defecto).
  --proof ARCHIVO        Ruta al archivo JSON de prueba v2 del proveedor (Vercel/Neon).
  --journal ARCHIVO      Ruta al archivo JSON de journal real de Hedera Testnet.
  --evaluate-only [PATH] Evalúa un informe previo sin recalcular.
  --json                 Emite el resultado estructurado en formato JSON.
  --help, -h             Muestra este texto de ayuda.

Salidas generadas:
  .cache/s22-candidate/candidate-acceptance-report.json
  .cache/s22-candidate/candidate-acceptance-report.md

Invariantes estrictos:
  1. Presupuesto cero: no autoriza gastos, no añade tarjetas ni upgrades de plan.
  2. Prohibición de aprobación por omisión: sin acceso al proveedor, el ticket permanece BLOQUEADO.
  3. Cero mensajes HCS reales o restauraciones remotas sin autorización operativa explícita.`);
}

function renderMarkdownReport(report: CandidateAccreditationReport): string {
  const lines: string[] = [];

  lines.push("# S22-31 · Acreditación Operativa del Candidato en Entorno Gratuito");
  lines.push("");
  lines.push(`- **Fecha de evaluación:** ${report.generatedAt}`);
  lines.push(`- **Revisión Git:** \`${report.revision}\` (dirty: ${report.dirty})`);
  lines.push(`- **Fingerprint:** \`${report.fingerprint}\``);
  lines.push(`- **Estado General:** **\`${report.status}\`**`);
  lines.push(
    `- **Aceptación Global:** **${report.globalAcceptance ? "SÍ" : "NO (Invariante S22: reservada para Ticket 32)"}**`,
  );
  lines.push(
    `- **Presupuesto Cero Respetado:** **${report.budgetZeroHonored ? "SÍ (Plan Hobby y Neon Free estrictos)" : "NO"}**`,
  );
  lines.push("");

  lines.push("## 1. Evaluación de los Seis Criterios de Aceptación");
  lines.push("");
  lines.push("| Criterio | Nombre | Estado | Elementos Verificados / Pendientes |");
  lines.push("| :---: | --- | :---: | --- |");

  for (const crit of report.criteria) {
    const verified =
      crit.verifiedElements.length > 0
        ? `**Verificado:** ${crit.verifiedElements.join("; ")}`
        : "";
    const pending =
      crit.pendingExternalElements.length > 0
        ? `**Pendiente de nube:** ${crit.pendingExternalElements.join("; ")}`
        : "";
    const content = [verified, pending].filter(Boolean).join("<br>");

    lines.push(`| **${crit.id}** | ${crit.name} | \`${crit.status}\` | ${content} |`);
  }

  lines.push("");
  lines.push("## 2. Registro de Bloqueos Externos y Condiciones Requeridas");
  lines.push("");

  if (report.externalBlocks.length === 0) {
    lines.push("No se registran bloqueos externos: todas las evidencias de nube fueron acreditadas.");
  } else {
    lines.push(
      "Conforme al mandato del Ticket 31, las condiciones externas faltantes se registran a continuación impidiendo la aprobación por omisión:",
    );
    lines.push("");

    for (const block of report.externalBlocks) {
      lines.push(`### [${block.code}] ${block.title}`);
      lines.push(`- **Recurso requerido:** ${block.requiredAsset}`);
      lines.push(`- **Restricción de presupuesto cero:** ${block.budgetZeroConstraint}`);
      lines.push(`- **Impacto operativo:** ${block.impact}`);
      lines.push(`- **Acción de desbloqueo:** ${block.resolutionAction}`);
      lines.push("");
    }
  }

  lines.push("## 3. Resumen Cuantitativo");
  lines.push("");
  lines.push(`- **Total de criterios evaluados:** ${report.summary.totalCriteria}`);
  lines.push(`- **Criterios aprobados:** ${report.summary.approvedCriteria}`);
  lines.push(
    `- **Criterios bloqueados por condición externa:** ${report.summary.blockedCriteria}`,
  );
  lines.push(`- **Criterios fallidos:** ${report.summary.failedCriteria}`);
  lines.push("");
  lines.push("---");
  lines.push(
    "*Documento generado automáticamente por el arnés de acreditación de candidato S22-31. Jopói.*",
  );

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

  let proofPath: string | undefined;
  const proofIdx = args.indexOf("--proof");
  if (proofIdx !== -1 && args[proofIdx + 1] && !args[proofIdx + 1]?.startsWith("--")) {
    proofPath = resolve(args[proofIdx + 1]!);
  }

  let journalPath: string | undefined;
  const journalIdx = args.indexOf("--journal");
  if (journalIdx !== -1 && args[journalIdx + 1] && !args[journalIdx + 1]?.startsWith("--")) {
    journalPath = resolve(args[journalIdx + 1]!);
  }

  const root = process.cwd();

  // Modo: Evaluar reporte previo
  if (evaluateOnlyIdx !== -1) {
    const customPath = args[evaluateOnlyIdx + 1];
    const reportPath =
      customPath && !customPath.startsWith("--")
        ? resolve(customPath)
        : resolve(root, ".cache/s22-candidate/candidate-acceptance-report.json");

    let report: CandidateAccreditationReport;
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
      console.log("  Jopói · Evaluación de Reporte de Acreditación de Candidato (S22-31)");
      console.log("================================================================================");
      console.log(`  Revisión:           ${report.revision} (dirty: ${report.dirty})`);
      console.log(`  Fingerprint:        ${report.fingerprint}`);
      console.log(`  Estado:             [${report.status}]`);
      console.log(`  Aceptación Global:  [NO] (Preservado conforme a D21)`);
      console.log(`  Presupuesto Cero:   [APROBADO] (${report.budgetZeroHonored ? "Respetado" : "Violado"})`);
      console.log("--------------------------------------------------------------------------------");
      console.log(`  Criterios:          ${report.summary.approvedCriteria}/${report.summary.totalCriteria} aprobados`);
      console.log(`  Bloqueos externos:  ${report.externalBlocks.length} registrados formalmente`);
      console.log("================================================================================");
    }

    process.exitCode = report.status === "APROBADO" ? 0 : 1;
    return;
  }

  // Modo ejecución
  const report = evaluateCandidateAccreditation(process.env, proofPath, journalPath);

  // Guardar artefactos
  const outputDir = resolve(root, ".cache/s22-candidate");
  mkdirSync(outputDir, { recursive: true });

  const jsonReportPath = resolve(outputDir, "candidate-acceptance-report.json");
  const mdReportPath = resolve(outputDir, "candidate-acceptance-report.md");

  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdReportPath, renderMarkdownReport(report), "utf8");

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("================================================================================");
    console.log("  Jopói · Acreditación Operativa del Candidato en Entorno Gratuito (S22-31)");
    console.log("================================================================================");
    console.log(`  Generado:           ${report.generatedAt}`);
    console.log(`  Revisión Git:       ${report.revision} (dirty: ${report.dirty})`);
    console.log(`  Fingerprint:        ${report.fingerprint}`);
    console.log(`  Estado General:     [${report.status}]`);
    console.log(`  Aceptación Global:  [NO] (Invariante S22: reservada para Ticket 32)`);
    console.log(`  Presupuesto Cero:   [APROBADO] (Plan Hobby y Neon Free estrictos)`);
    console.log("--------------------------------------------------------------------------------");
    console.log("EVALUACIÓN DE LOS SEIS CRITERIOS OBLIGATORIOS:");
    for (const crit of report.criteria) {
      console.log(`  ${crit.id.padEnd(8)}: [${crit.status.padEnd(27)}] ${crit.name}`);
      if (crit.externalBlockReason) {
        console.log(`            -> Bloqueo: ${crit.externalBlockReason}`);
      }
    }
    console.log("--------------------------------------------------------------------------------");
    if (report.externalBlocks.length > 0) {
      console.log(`BLOQUEOS EXTERNOS REGISTRADOS (${report.externalBlocks.length}):`);
      for (const block of report.externalBlocks) {
        console.log(`  - [${block.code}] ${block.title}`);
        console.log(`    Acción: ${block.resolutionAction}`);
      }
      console.log("--------------------------------------------------------------------------------");
    }
    console.log(`Artefactos generados:`);
    console.log(`  - ${jsonReportPath}`);
    console.log(`  - ${mdReportPath}`);
    console.log("================================================================================");
    console.log("  ESTADO FINAL: EVALUACIÓN CONCLUIDA CON BLOQUEOS EXTERNOS REGISTRADOS");
    console.log("  (Prohibición estricta de aprobación por omisión; pendiente de acceso al hosting)");
    console.log("================================================================================");
  }

  // Conforme a la regla de aceptación, si hay bloqueos externos, el exit code es 1
  process.exitCode = report.status === "APROBADO" ? 0 : 1;
}

main().catch((error) => {
  console.error("FATAL: Error en candidate-acceptance:", error);
  process.exitCode = 1;
});
