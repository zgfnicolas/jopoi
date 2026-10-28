import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evidenceRevision } from "../../../scripts/lib/evidence";
import type { Reporter, FullResult, Suite } from "@playwright/test/reporter";

export default class E2EReporter implements Reporter {
  suite?: Suite;
  onBegin(_config: unknown, suite: Suite) { this.suite = suite; }
  onEnd(result: FullResult) {
    const tests = this.suite?.allTests() ?? [];
    const cases = [...Array.from({ length: 15 }, (_, index) => `E2E-${String(index + 1).padStart(2, "0")}`), "S20-01", "S20-02"].map(id => {
      const matching = tests.filter(test => test.title.includes(id));
      const observations = matching.map(test => ({ project: test.parent.project()?.name, title: test.title,
        status: test.results.at(-1)?.status ?? "skipped", blocked: test.results.some(attempt => attempt.errors.some(error => /BLOCKED_|Executable doesn't exist/.test(error.message ?? ""))) }));
      const complete = ["chromium-desktop", "webkit-mobile", "chromium-desktop-dark", "webkit-mobile-dark"].every(project =>
        observations.filter(item => item.project === project).length === (id === "E2E-09" ? 2 : 1));
      return { id, result: observations.some(item => !item.blocked && ["failed", "timedOut", "interrupted"].includes(item.status)) ? "FALLIDO"
        : !complete || observations.some(item => item.blocked || item.status !== "passed") ? "BLOQUEADO" : "APROBADO", observations };
    });
    const directory = resolve(".cache/e2e");
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...evidenceRevision(),
      environment: "LOCAL_NEXT_DEV_POSTGRES_HEDERA_CONTROLADO", bundler: "webpack", mobile: "emulated", status: result.status, cases }, null, 2));
    writeFileSync(resolve(directory, "report.md"), "# S20 local · regresión S18 · claro/oscuro · móvil emulado · Hedera controlado\n\n| Caso | Resultado local |\n| --- | --- |\n" + cases.map(item => `| ${item.id} | ${item.result} |`).join("\n") + "\n\nE2E-12/13 y operación diaria publicada requieren evidencia externa. La suite local no acredita aceptación global ni conformidad WCAG completa.\n");
  }
}
