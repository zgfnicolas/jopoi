import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { ENVIRONMENT_VARIABLES } from "../../src/server/config/environment";
import { readProof } from "../../scripts/lib/acceptance-report";

const root = process.cwd();
const cache = resolve(root, ".cache");
const directory = resolve(cache, "acceptance", `s19-tests-${randomUUID()}`);
mkdirSync(directory, { recursive: true });
after(() => {
  assert.ok(directory.startsWith(cache + sep));
  rmSync(directory, { recursive: true, force: true });
});
// Offline parser fixtures: generated credentials, never provisioned or used to connect.
const pooledUrl = new URL("postgresql://ep-synthetic-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require");
pooledUrl.username = "synthetic";
pooledUrl.password = randomUUID();
const pooled = pooledUrl.href;
const direct = pooled.replace("-pooler", "");
function fixture(values: Record<string, string>) {
  const file = resolve(directory, `${randomUUID()}.env`);
  writeFileSync(file, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"));
  return file;
}
function cli(script: string, args: string[], extra: Record<string, string> = {}) {
  const environment = { ...process.env, ...Object.fromEntries(ENVIRONMENT_VARIABLES.map(name => [name, ""])), ...extra };
  const result = spawnSync(process.execPath, ["--import", "tsx", "--", `scripts/${script}.ts`, ...args], {
    cwd: root, env: environment, encoding: "utf8", windowsHide: true, timeout: 90000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.doesNotMatch(result.stdout + result.stderr, /private-marker|ambient-marker/);
  assert.ok(!(result.stdout + result.stderr).includes(pooledUrl.password), "CLI output must not expose generated credentials");
  return result;
}
function check(values: Record<string, string>, selector = "--vercel-env-file") {
  const result = cli("delivery", ["check", "--profile", "local", selector, fixture(values)]);
  assert.ok(result.status === 0 || result.status === 1, result.stderr + result.stdout);
  return JSON.parse(result.stdout);
}
function migrations(report: ReturnType<typeof check>) {
  return report.configuration.find((item: { capability: string }) => item.capability === "migrations");
}

test("CLI: native export selects Jopói keys and accepts the unpooled connection", () => {
  const report = check({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct, VERCEL_ENV: "production", PGPASSWORD: "private-marker" });
  assert.equal(migrations(report).status, "configured");
  assert.equal(report.connectivity, "unchecked");
});
test("CLI: legacy DIRECT_URL and matching native aliases remain compatible", () => {
  assert.equal(migrations(check({ DIRECT_URL: direct }, "--env-file")).status, "configured");
  assert.equal(migrations(check({ DIRECT_URL: direct, DATABASE_URL_UNPOOLED: direct })).status, "configured");
});
test("CLI: conflicting administrative connections are invalid", () => {
  const report = check({ DIRECT_URL: direct, DATABASE_URL_UNPOOLED: direct.replace("neondb", "otherdb") });
  assert.equal(migrations(report).status, "invalid");
});
test("CLI: invalid unpooled connection cannot silently fall back to DIRECT_URL", () => {
  assert.equal(migrations(check({ DIRECT_URL: direct, DATABASE_URL_UNPOOLED: "invalid" })).status, "invalid");
});
test("CLI: explicit files seal missing keys against the inherited environment", () => {
  for (const selector of ["--env-file", "--vercel-env-file"]) {
    const result = cli("delivery", ["check", selector, fixture({})], {
      DIRECT_URL: direct, DATABASE_URL_UNPOOLED: direct, SESSION_SECRET: "ambient-marker".repeat(4),
    });
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(migrations(report).status, "missing");
    assert.equal(report.configuration.find((item: { capability: string }) => item.capability === "session").status, "missing");
  }
});
test("CLI: strict file rejects additional Vercel variables", () => {
  const result = cli("delivery", ["check", "--env-file", fixture({ VERCEL_ENV: "production" })]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INVALID_ENVIRONMENT_FILE/);
});
test("CLI: selectors are exclusive, cannot repeat and require a filename", () => {
  for (const args of [
    ["--env-file", "missing", "--vercel-env-file", "missing"],
    ["--vercel-env-file", "missing", "--vercel-env-file", "missing"], ["--vercel-env-file"],
  ]) {
    const result = cli("database", ["status", ...args]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /INVALID_CLI_ARGUMENTS/);
  }
});
test("CLI: candidate requires complete configuration and never claims connectivity", () => {
  const result = cli("delivery", ["check", "--profile", "candidate", "--vercel-env-file", fixture({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct })]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(migrations(report).status, "configured");
  assert.equal(report.connectivity, "unchecked");
  assert.equal(report.accountsAndPlans, "unchecked");
});
test("CLI: a complete native candidate passes offline with pooled TLS and the same direct target", () => {
  const values = {
    NODE_ENV: "production", DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct, VERCEL_ENV: "production",
    SESSION_SECRET: "s19-session-secret-synthetic-only-12345", CRON_SECRET: "s19-cron-secret-synthetic-only-6789012",
    APP_URL: "https://synthetic.vercel.app", HEDERA_OPERATOR_ID: "0.0.17", HEDERA_TOPIC_ID: "0.0.170",
    HEDERA_OPERATOR_KEY: "302e020100300506032b657004220420" + "11".repeat(32),
    HCS_CONFIGURATION_GENERATION: "s19", HCS_DAILY_LIMIT: "100",
  };
  const invoke = (overrides: Record<string, string> = {}) => cli("delivery", ["check", "--profile", "candidate", "--vercel-env-file", fixture({ ...values, ...overrides })]);
  const valid = invoke();
  assert.equal(valid.status, 0, valid.stderr + valid.stdout);
  assert.equal(JSON.parse(valid.stdout).code, "CONFIGURATION_VALID_UNVERIFIED");
  const invalidConnections: Record<string, string>[] = [
    { DATABASE_URL: pooled.replace("?sslmode=require", "") },
    { DATABASE_URL_UNPOOLED: direct.replace("neondb", "otherdb") },
    { DATABASE_URL_UNPOOLED: pooled },
  ];
  for (const overrides of invalidConnections) {
    const invalid = invoke(overrides);
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).code, "DELIVERY_CHECK_BLOCKED");
  }
});
test("CLI: migrations using the native alias still enforce --local-only before SQL", () => {
  const result = cli("database", ["status", "--local-only", "--vercel-env-file", fixture({ DATABASE_URL_UNPOOLED: direct })]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_UNAVAILABLE/);
});
test("CLI: every administrative help accepts native selector without reading a missing file", () => {
  for (const [script, command] of [["delivery", "check"], ["database", "status"], ["ops-status"], ["export-contacts"], ["maintenance"], ["create-topic"], ["acceptance", "live"]]) {
    assert.ok(script, "CLI fixture requires a script");
    const result = cli(script, [...(command ? [command] : []), "--help", "--vercel-env-file", "nonexistent-s19-file"]);
    assert.equal(result.status, 0, `${script}: ${result.stderr}`);
    assert.match(result.stdout, /--vercel-env-file/);
  }
});

test("S22 CLI: missing and repeated arguments fail before reading an explicit environment", () => {
  const cases: readonly (readonly [string, string[]])[] = [
    ["database", []], ["delivery", []], ["delivery", ["check", "--profile"]],
    ["acceptance", ["check", "--evidence"]], ["acceptance", ["check", "--journal"]],
    ["acceptance", ["check", "--evidence", "one", "--evidence", "two"]],
    ["acceptance", ["live", "--run"]], ["create-topic", ["status", "--file"]],
  ];
  for (const [script, args] of cases) {
    const result = cli(script, [...args, "--env-file", "nonexistent-s22-file"]);
    assert.equal(result.status, 2, `${script}: ${result.stderr}`);
    assert.match(result.stderr, /INVALID_CLI_ARGUMENTS/);
    assert.doesNotMatch(result.stderr, /INVALID_ENVIRONMENT_FILE|ENOENT/);
  }
});

test("S22 CLI: an explicit missing file cannot fall back to inherited configuration", () => {
  for (const selector of ["--env-file", "--vercel-env-file"]) {
    const result = cli("delivery", ["check", selector, "nonexistent-s22-file"], { DATABASE_URL: pooled, DIRECT_URL: direct });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENVIRONMENT_FILE/);
    assert.equal(result.stdout, "");
  }
});

const artifact = resolve(directory, "review.txt");
writeFileSync(artifact, "Synthetic evidence for parser tests; not a provider review.");
const source = { file: artifact, sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex") };
const revision = "a".repeat(40), projectId = "prj_synthetic", origin = "https://synthetic.vercel.app";
function proof() {
  return {
    version: 2, observedAt: new Date().toISOString(), candidateUrl: origin, deploymentRevision: revision,
    reviewMethod: "vercel-dashboard", reviewed: true,
    vercel: { projectId, plan: "Hobby", noPaymentMethod: true, noAutomaticUpgrade: true, source },
    database: { provider: "neon", plan: "Free", projectId, resourceId: "synthetic-resource", integrationMode: "native",
      provisioning: "vercel-marketplace", environments: ["production"], noIndependentAccount: true,
      credentialsSynced: true, noPaymentMethod: true, noAutomaticUpgrade: true, source },
    cron: { schedule: "0 3 * * *", executedAt: new Date().toISOString(), result: "MAINTENANCE_COMPLETE", source },
  };
}
function readEvidence(value: unknown, expectedProjectId = projectId, expectedOrigin = origin, expectedRevision = revision) {
  const file = resolve(directory, `${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(value));
  return readProof(file, expectedOrigin, expectedRevision, expectedProjectId);
}
test("Evidence: accepts a reviewed v2 manifest for the selected project and candidate", () => {
  assert.ok(readEvidence(proof()));
});
test("Evidence: rejects legacy and incomplete native-integration manifests", () => {
  assert.equal(readEvidence({ ...proof(), version: 1 }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, credentialsSynced: false } }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, noIndependentAccount: false } }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, integrationMode: "connectable" } }), null);
  assert.equal(readEvidence({ ...proof(), reviewed: false }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, noAutomaticUpgrade: false } }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, plan: "Paid" } }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, environments: ["production", "preview"] } }), null);
});
test("Evidence: rejects another project, mismatched resource binding, origin or revision", () => {
  assert.equal(readEvidence(proof(), "prj_other"), null);
  assert.equal(readEvidence(proof(), ""), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, projectId: "prj_other" } }), null);
  assert.equal(readEvidence(proof(), projectId, "https://other.vercel.app"), null);
  assert.equal(readEvidence(proof(), projectId, origin, "b".repeat(40)), null);
});
test("Evidence: rejects stale or future observations and modified or misplaced artifacts", () => {
  for (const days of [-8, 1]) {
    const timestamp = new Date(Date.now() + days * 86400000).toISOString();
    assert.equal(readEvidence({ ...proof(), observedAt: timestamp }), null);
    assert.equal(readEvidence({ ...proof(), cron: { ...proof().cron, executedAt: timestamp } }), null);
  }
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, source: { ...source, sha256: "0".repeat(64) } } }), null);
  assert.equal(readEvidence({ ...proof(), database: { ...proof().database, source: { ...source, file: resolve(root, "README.md") } } }), null);
});
