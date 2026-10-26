import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Reporter, TestModule } from "vitest/node";

export default class ApiReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>, errors: ReadonlyArray<unknown>) {
    const tests = modules.flatMap(module => [...module.children.allTests()].map(test => {
      const result = test.result();
      return { name: test.fullName, state: result.state,
        blocked: result.errors?.some(error => /BLOCKED_|TIMEOUT_WAITING_FOR_NEXT_READY/.test(error.message)) ?? false };
    }));
    const cases = Array.from({ length: 26 }, (_, index) => {
      const id = `API-${String(index + 1).padStart(2, "0")}`;
      const matching = tests.filter(test => test.name.includes(id));
      return { id, result: matching.some(test => test.state === "failed" && !test.blocked) ? "FALLIDO"
        : !matching.length || matching.some(test => test.blocked || test.state === "pending" || test.state === "skipped") ? "BLOQUEADO"
        : "APROBADO", tests: matching.map(test => test.name) };
    });
    const directory = resolve(".cache", "api-tests", "results");
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), evidence: "HEDERA_CONTROLADO_NO_TESTNET_REAL", startupErrors: errors.length, cases }, null, 2));
    writeFileSync(resolve(directory, "report.md"), "# S17 · Hedera controlado (no testnet real)\n\n| Caso | Resultado |\n| --- | --- |\n" + cases.map(item => `| ${item.id} | ${item.result} |`).join("\n") + "\n");
    const selected = process.argv.some(argument => argument === "-t" || argument.startsWith("--testNamePattern") || /tests[\\/]api[\\/].*\.test\.ts$/.test(argument));
    if (!selected && cases.some(item => item.result !== "APROBADO")) process.exitCode = 1;
  }
}
