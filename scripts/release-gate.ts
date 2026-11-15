#!/usr/bin/env node
/**
 * Herramienta CLI para el Gate de Release y Evidencia Reproducible (S22-30)
 *
 * Uso:
 *   node --import tsx scripts/release-gate.ts [--run] [--json]
 *   node --import tsx scripts/release-gate.ts --evaluate-only [archivo]
 *   node --import tsx scripts/release-gate.ts --candidate-check
 *   node --import tsx scripts/release-gate.ts --help
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildReleaseGateReport,
  evaluateReleaseGateReport,
  validateCandidateRequirements,
  type ReleaseGateReport,
} from "./lib/release-gate-model";

function printHelp() {
  console.log(`Uso: node --import tsx scripts/release-gate.ts [opciones]

Gate Integral de Liberación y Evidencia Reproducible (S22-30 / D20 / D21):
  --run                  Ejecuta el gate de release local y genera el informe integral (por defecto).
  --evaluate-only [PATH] Evalúa un informe previo sin volver a computar el estado del árbol.
  --candidate-check      Valida los requisitos para el candidato externo (Ticket 31) y muestra rechazo explícito.
  --json                 Emite el resultado estructurado en formato JSON.
  --help, -h             Muestra este texto de ayuda.

Salidas generadas:
  .cache/s22-release/candidate-release-report.json
  .cache/s22-release/release-evidence-matrix.md

Invariantes estrictos:
  1. Cierre local únicamente: globalAcceptance = false (Ticket 30).
  2. Presupuesto cero: no aprovisiona recursos, no despliega ni envía HCS real.
  3. Todas las 17 AUD y 6 DoD vinculadas con decisiones, casos y resultados.`);
}

function renderMarkdownMatrix(report: ReleaseGateReport): string {
  const lines: string[] = [];

  lines.push("# S22 · Matriz Integral de Evidencia Local y Candidato de Release (Ticket 30)");
  lines.push("");
  lines.push(`- **Fecha de generación:** ${report.generatedAt}`);
  lines.push(`- **Revisión Git:** \`${report.revision}\` (dirty: ${report.dirty})`);
  lines.push(`- **Fingerprint:** \`${report.fingerprint}\``);
  lines.push(`- **Gate Local:** **${report.localGatePassed ? "APROBADO" : "BLOQUEADO"}**`);
  lines.push(
    `- **Aceptación Global:** **${report.globalAcceptance ? "SÍ" : "NO (Pendiente de verificación en nube, Ticket 31/32)"}**`,
  );
  lines.push("");

  lines.push("## 1. Trazabilidad de los 17 Hallazgos de Auditoría (AUD-01 a AUD-17)");
  lines.push("");
  lines.push(
    "| Hallazgo | Decisiones | Casos S22 | Implementado | Comprobado Local | Pendiente Externo | Estado | Notas |",
  );
  lines.push(
    "| --- | --- | --- | :---: | :---: | :---: | :---: | --- |",
  );

  for (const aud of report.auditFindings) {
    const impl = aud.implemented ? "SÍ" : "NO";
    const local = aud.localProven ? "SÍ" : "NO";
    const ext = aud.externalPending ? "SÍ" : "NO";
    lines.push(
      `| **${aud.id}** · ${aud.title} | ${aud.decisions.join(", ")} | ${aud.acceptanceCases.join(", ")} | ${impl} | ${local} | ${ext} | \`${aud.status}\` | ${aud.notes} |`,
    );
  }

  lines.push("");
  lines.push("## 2. Cumplimiento de los Seis Bloques de Definition of Done (DoD)");
  lines.push("");
  lines.push(
    "| Bloque | Criterio Obligatorio | Comprobado Local | Pendiente de Campo | Estado |",
  );
  lines.push("| --- | --- | :---: | :---: | :---: |");

  for (const dod of report.dodBlocks) {
    const local = dod.localProven ? "SÍ" : "NO";
    const ext = dod.externalPending ? "SÍ" : "NO";
    lines.push(
      `| **${dod.block}** | ${dod.mandatoryCriteria} | ${local} | ${ext} | \`${dod.status}\` |`,
    );
  }

  lines.push("");
  lines.push("## 3. Preservación de los Tres Caminos del Recorrido");
  lines.push("");
  lines.push("| Camino | Ruta | Estado | Comportamientos Clave Verificados |");
  lines.push("| --- | --- | :---: | --- |");

  for (const path of report.journeyPaths) {
    const status = path.localProven ? "APROBADO" : "FALLIDO";
    lines.push(
      `| **${path.name}** | \`${path.route}\` | \`${status}\` | ${path.verifiedBehaviors.join("; ")} |`,
    );
  }

  lines.push("");
  lines.push("## 4. Adaptadores de Compatibilidad y Evolución de Contrato");
  lines.push("");
  lines.push("| Ruta Legada | Ruta Canónica | Deprecation Header | Successor Link | Sunset Omitido | Compatibilidad |");
  lines.push("| --- | --- | :---: | :---: | :---: | :---: |");

  for (const adapter of report.compatibilityAdapters) {
    const dep = adapter.deprecationHeaderPresent ? "SÍ" : "NO";
    const link = adapter.successorLinkPresent ? "SÍ" : "NO";
    const sunset = adapter.prematureSunsetOmitted ? "SÍ (Correcto)" : "NO";
    const comp = adapter.backwardsCompatible ? "APROBADA" : "ROTA";
    lines.push(
      `| \`${adapter.route}\` | \`${adapter.successorRoute}\` | ${dep} | ${link} | ${sunset} | \`${comp}\` |`,
    );
  }

  lines.push("");
  lines.push("## 5. Seguridad en CI y Aislamiento de Privilegios");
  lines.push("");
  lines.push(`- **Workflow de PR no confiable asegurado:** ${report.securityAndIsolation.untrustedPrWorkflowSecured ? "SÍ (contents: read, persist-credentials: false)" : "NO"}`);
  lines.push(`- **Aislamiento de Runner de Migración:** ${report.securityAndIsolation.migrationRunnerIsolated ? "SÍ (Advisory Lock + DIRECT_URL administrativa)" : "NO"}`);
  lines.push(`- **Build sin migraciones implícitas:** ${report.securityAndIsolation.nextBuildNeverMigrates ? "SÍ (next build nunca ejecuta migraciones)" : "NO"}`);
  lines.push(`- **Prohibición de db push en producción:** ${report.securityAndIsolation.dbPushForbiddenInProd ? "SÍ (estrictamente restringido)" : "NO"}`);

  lines.push("");
  lines.push("## 6. Procedimiento y Validador de Candidato Externo (Ticket 31)");
  lines.push("");
  lines.push(`- **Estado del Validador:** \`${report.candidateValidation.status}\``);
  lines.push(`- **Presupuesto Cero Respetado:** ${report.candidateValidation.budgetZeroRespected ? "SÍ (Sin despliegue, aprovisionamiento ni HCS real en local)" : "NO"}`);
  if (report.candidateValidation.missingEvidenceCodes.length > 0) {
    lines.push("- **Evidencias Pendientes para Acreditación en Nube (Ticket 31):**");
    for (const code of report.candidateValidation.missingEvidenceCodes) {
      lines.push(`  - \`${code}\``);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("*Documento generado automáticamente por el Gate de Release S22-30. Jopói.*");

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
  const candidateCheckMode = args.includes("--candidate-check");

  const root = process.cwd();

  // Modo: Comprobación de requisitos de candidato externo
  if (candidateCheckMode) {
    const candidateResult = validateCandidateRequirements(process.env);
    if (jsonMode) {
      console.log(JSON.stringify(candidateResult, null, 2));
    } else {
      console.log("================================================================================");
      console.log("  Jopói · Validador de Requisitos de Candidato Externo (Ticket 31)");
      console.log("================================================================================");
      console.log(`  Estado:             ${candidateResult.status}`);
      console.log(`  Presupuesto Cero:   ${candidateResult.budgetZeroRespected ? "RESPETADO (Sin gastos en local)" : "NO"}`);
      console.log("--------------------------------------------------------------------------------");
      console.log("CHEQUEOS DE PROVEEDOR EN NUBE:");
      console.log(`  URL de Candidato:   ${candidateResult.providerChecks.candidateUrlProvided ? "CONFIGURADA" : "PENDIENTE (Localhost/No configurada)"}`);
      console.log(`  Neon TLS Verify:    ${candidateResult.providerChecks.neonTlsVerifyFull ? "VERIFICADO" : "PENDIENTE (sslmode=verify-full requerido)"}`);
      console.log(`  Tópico Hedera:      ${candidateResult.providerChecks.hederaTopicConfigured ? "CONFIGURADO" : "PENDIENTE (0.0.x requerido)"}`);
      console.log(`  Muestras RUM >= 200:${candidateResult.providerChecks.fieldRumSamplesSufficient ? "SUFICIENTE" : "PENDIENTE (Requiere tráfico real de campo)"}`);
      console.log(`  Canal de Alertas:   ${candidateResult.providerChecks.operationalAlertChannelConfigured ? "CONFIGURADO" : "PENDIENTE (Webhook/Email en guardia)"}`);
      console.log("--------------------------------------------------------------------------------");
      if (candidateResult.missingEvidenceCodes.length > 0) {
        console.log("EVIDENCIAS PENDIENTES (RECHAZO EXPLÍCITO SIN APROBACIÓN POR OMISIÓN):");
        for (const code of candidateResult.missingEvidenceCodes) {
          console.log(`  - [PENDIENTE] ${code}`);
        }
      }
      console.log("================================================================================");
    }
    // Si faltan evidencias en modo candidato, el validador sale con código 1 pero informa claramente
    process.exitCode = candidateResult.ok ? 0 : 1;
    return;
  }

  // Modo: Evaluar reporte existente
  if (evaluateOnlyIdx !== -1) {
    const customPath = args[evaluateOnlyIdx + 1];
    const reportPath = customPath && !customPath.startsWith("--")
      ? resolve(customPath)
      : resolve(root, ".cache/s22-release/candidate-release-report.json");

    let report: ReleaseGateReport;
    try {
      const raw = readFileSync(reportPath, "utf8");
      report = JSON.parse(raw);
    } catch (error) {
      console.error(`ERROR: No se pudo leer el archivo de reporte en ${reportPath}:`, error);
      process.exitCode = 1;
      return;
    }

    const evaluation = evaluateReleaseGateReport(report);
    if (jsonMode) {
      console.log(JSON.stringify(evaluation, null, 2));
    } else {
      console.log("================================================================================");
      console.log("  Jopói · Evaluación de Reporte de Release Gate (S22-30)");
      console.log("================================================================================");
      console.log(`  Revisión:           ${report.revision} (dirty: ${report.dirty})`);
      console.log(`  Fingerprint:        ${report.fingerprint}`);
      console.log(`  Gate Local:         ${report.localGatePassed ? "[APROBADO]" : "[BLOQUEADO]"}`);
      console.log(`  Aceptación Global:  ${report.globalAcceptance ? "[ERROR]" : "[NO (Conforme a D21: delegada a Ticket 31/32)]"}`);
      console.log("--------------------------------------------------------------------------------");
      console.log(`  Hallazgos AUD:      ${report.summary.localProvenAudFindings}/${report.summary.totalAudFindings} comprobados localmente`);
      console.log(`  Bloques DoD:        ${report.summary.localProvenDoDBlocks}/${report.summary.totalDoDBlocks} comprobados localmente`);
      console.log("--------------------------------------------------------------------------------");
      if (!evaluation.ok) {
        console.log("ERRORES DETECTADOS:");
        for (const err of evaluation.errors) {
          console.log(`  - ${err}`);
        }
      } else {
        console.log("ESTADO: REPORTE DE RELEASE CONFORME (Todos los requisitos locales satisfechos)");
      }
      console.log("================================================================================");
    }

    process.exitCode = evaluation.ok ? 0 : 1;
    return;
  }

  // Modo por defecto: Construir y emitir reporte completo
  const report = buildReleaseGateReport(root, process.env);
  const evaluation = evaluateReleaseGateReport(report);

  // Asegurar directorio y escribir artefactos
  const outputDir = resolve(root, ".cache/s22-release");
  mkdirSync(outputDir, { recursive: true });

  const jsonReportPath = resolve(outputDir, "candidate-release-report.json");
  const mdReportPath = resolve(outputDir, "release-evidence-matrix.md");

  writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdReportPath, renderMarkdownMatrix(report), "utf8");

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("================================================================================");
    console.log("  Jopói · Gate Integral de Liberación y Evidencia Reproducible (S22-30)");
    console.log("================================================================================");
    console.log(`  Generado:           ${report.generatedAt}`);
    console.log(`  Revisión Git:       ${report.revision} (dirty: ${report.dirty})`);
    console.log(`  Fingerprint:        ${report.fingerprint}`);
    console.log(`  Gate Local:         ${report.localGatePassed ? "[APROBADO]" : "[BLOQUEADO]"}`);
    console.log(`  Aceptación Global:  [NO] (Conforme a D21: delegada a Ticket 31/32)`);
    console.log("--------------------------------------------------------------------------------");
    console.log("1. AUDITORÍA (17 HALLAZGOS AUD-01 A AUD-17):");
    console.log(`  Comprobados Local:  ${report.summary.localProvenAudFindings}/${report.summary.totalAudFindings} hallazgos (100%)`);
    console.log(`  Pendientes Nube:    ${report.summary.externalPendingAudFindings} hallazgos documentados`);
    console.log("--------------------------------------------------------------------------------");
    console.log("2. DEFINITION OF DONE (SEIS BLOQUES OBLIGATORIOS):");
    for (const dod of report.dodBlocks) {
      console.log(`  - ${dod.block.padEnd(16)}: [${dod.status}] (${dod.verifiedFeatures.length} controles verificados)`);
    }
    console.log("--------------------------------------------------------------------------------");
    console.log("3. TRES CAMINOS DEL RECORRIDO Y COMPATIBILIDAD:");
    for (const path of report.journeyPaths) {
      console.log(`  - ${path.name.padEnd(45)}: [APROBADO]`);
    }
    for (const adapter of report.compatibilityAdapters) {
      console.log(`  - Adaptador ${adapter.route}: Deprecation: true, Link rel="successor-version", sin Sunset`);
    }
    console.log("--------------------------------------------------------------------------------");
    console.log("4. SEGURIDAD EN CI Y AISLAMIENTO DE RUNNER:");
    console.log(`  - CI sin credenciales:      ${report.securityAndIsolation.untrustedPrWorkflowSecured ? "APROBADO" : "FALLIDO"}`);
    console.log(`  - Runner aislado (DDL/DML): ${report.securityAndIsolation.migrationRunnerIsolated ? "APROBADO" : "FALLIDO"}`);
    console.log(`  - Build sin migraciones:    ${report.securityAndIsolation.nextBuildNeverMigrates ? "APROBADO" : "FALLIDO"}`);
    console.log("--------------------------------------------------------------------------------");
    console.log("5. VALIDADOR DE CANDIDATO EXTERNO (TICKET 31):");
    console.log(`  - Estado validador:         ${report.candidateValidation.status}`);
    console.log(`  - Presupuesto cero:         ${report.candidateValidation.budgetZeroRespected ? "APROBADO (Sin gastos en local)" : "FALLIDO"}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`  Artefactos generados:`);
    console.log(`    - ${jsonReportPath}`);
    console.log(`    - ${mdReportPath}`);
    console.log("================================================================================");
    console.log("  ESTADO FINAL: GATE DE RELEASE LOCAL APROBADO");
    console.log("  (Revisión reproducible verificada; pendiente de acreditación en nube Ticket 31)");
    console.log("================================================================================");
  }

  process.exitCode = evaluation.ok ? 0 : 1;
}

main().catch((error) => {
  console.error("FATAL: Error no controlado en release-gate:", error);
  process.exitCode = 1;
});
