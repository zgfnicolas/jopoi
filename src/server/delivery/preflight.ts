import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { createConfigReader, describeConfiguration, type Environment } from "../config/environment";
import { DEMO_POLICY } from "../../shared/demo-policy";

export type DeliveryProfile = "local" | "candidate";
interface Issue { check: string; code: string; level: "error" | "warning" }
const manifestSchema = z.object({ assets: z.array(z.object({ localPath: z.string() })).min(1) });
const packageSchema = z.object({ engines: z.object({ node: z.string() }), scripts: z.object({ build: z.string() }),
  dependencies: z.record(z.string(), z.string()), devDependencies: z.record(z.string(), z.string()) });
const lockSchema = z.object({ lockfileVersion: z.literal(3), packages: z.record(z.string(), z.object({
  dependencies: z.record(z.string(), z.string()).optional(), devDependencies: z.record(z.string(), z.string()).optional(),
})) });
function json(path: string): unknown { return JSON.parse(readFileSync(path, "utf8")); }

/** Files and CPU only. Do not import a database client, instantiate an SDK client, sign or call fetch. */
export async function deliveryCheck(root: string, profile: DeliveryProfile, environment: Environment) {
  const issues: Issue[] = [];
  const add = (check: string, code: string, level: Issue["level"] = "error") => issues.push({ check, code, level });
  if (Number(process.versions.node.split(".")[0]) !== 24) add("node", "NODE_24_REQUIRED");
  try {
    const pkg = packageSchema.parse(json(resolve(root, "package.json")));
    const lock = lockSchema.parse(json(resolve(root, "package-lock.json")));
    const locked = lock.packages[""];
    for (const field of ["dependencies", "devDependencies"] as const) {
      const actual = Object.entries(pkg[field]).sort(([a], [b]) => a.localeCompare(b));
      const expected = Object.entries(locked?.[field] ?? {}).sort(([a], [b]) => a.localeCompare(b));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) add("lockfile", "LOCKFILE_OUT_OF_SYNC");
    }
    if (![">=24.0.0 <25", "24.x"].includes(pkg.engines.node)) add("node", "NODE_ENGINE_MISMATCH");
    if (pkg.scripts.build !== "prisma generate && next build") add("build", "BUILD_SEQUENCE_REVIEW_REQUIRED");
  } catch { add("manifest", "PACKAGE_OR_LOCKFILE_INVALID"); }
  try {
    const cron = z.object({ crons: z.array(z.object({ path: z.string(), schedule: z.string() })) }).parse(json(resolve(root, "vercel.json")));
    const daily = cron.crons[0];
    if (cron.crons.length !== 1 || daily?.path !== "/api/cron" || daily.schedule !== "0 3 * * *") add("cron", "DAILY_CRON_REVIEW_REQUIRED");
  } catch { add("cron", "CRON_CONFIGURATION_INVALID"); }
  try {
    const publicRoot = resolve(root, "public");
    const manifest = manifestSchema.parse(json(resolve(publicRoot, "demo/chips-v1/manifest.json")));
    for (const asset of manifest.assets) {
      const path = resolve(publicRoot, `.${asset.localPath}`), child = relative(publicRoot, path);
      if (!asset.localPath.startsWith("/demo/chips-v1/") || child.startsWith("..") || isAbsolute(child) || !statSync(path).isFile() || statSync(path).size === 0) throw new Error();
    }
    for (const path of ["src/app/fonts/BarlowSemiCondensed-SemiBold.ttf", "src/app/fonts/OFL.txt"]) if (statSync(resolve(root, path)).size === 0) throw new Error();
  } catch { add("assets", "LOCAL_ASSETS_MISSING_OR_INVALID"); }
  try {
    const expected = ["202610220001_initial", "202610230001_session_intents", "202610230002_hcs_binding", "202610230003_publication_coordination", "202610290001_request_rate_limits", "202610300001_operation_invariants_expand", "202610300002_operation_invariants_validate"];
    const actual = readdirSync(resolve(root, "prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected.sort()) || actual.some(name => !existsSync(resolve(root, "prisma/migrations", name, "migration.sql")))) add("migrations", "MIGRATION_INVENTORY_REVIEW_REQUIRED");
  } catch { add("migrations", "MIGRATION_INVENTORY_INVALID"); }
  const values = profile === "candidate" ? { ...environment, NODE_ENV: "production" } : environment;
  const reader = createConfigReader(values);
  const configuration = Object.values(reader).map(read => describeConfiguration<unknown>(read()));
  for (const item of configuration) if (item.status !== "configured") add(item.capability, "CONFIGURATION_" + item.status.toUpperCase(), profile === "local" && item.status === "missing" ? "warning" : "error");
  const session = reader.session(), maintenance = reader.maintenance();
  if (session.status === "configured" && maintenance.status === "configured" && session.config.secret === maintenance.config.secret) add("secrets", "INDEPENDENT_SECRETS_REQUIRED");
  const operator = reader.hederaOperator();
  if (operator.status === "configured") {
    try { const { readOperator } = await import("../hedera/sdk"); readOperator(values); }
    catch { add("hederaOperator", "HCS_INVALID_KEY"); }
  }
  if (profile === "candidate") {
    const database = reader.database(), migrations = reader.migrations();
    if (database.status === "configured" && migrations.status === "configured") {
      const app = new URL(database.config.url), direct = new URL(migrations.config.url);
      const secure = (url: URL) => ["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")
        && [...url.searchParams.keys()].every(key => ["sslmode", "channel_binding"].includes(key) && url.searchParams.getAll(key).length === 1)
        && (!url.searchParams.has("channel_binding") || url.searchParams.get("channel_binding") === "require");
      if (!app.hostname.endsWith(".neon.tech") || !app.hostname.split(".")[0]?.endsWith("-pooler") || !secure(app)) add("database", "NEON_POOLED_TLS_REQUIRED");
      if (!direct.hostname.endsWith(".neon.tech") || direct.hostname.split(".")[0]?.endsWith("-pooler") || !secure(direct)) add("migrations", "NEON_DIRECT_TLS_REQUIRED");
      if (app.hostname.replace(/-pooler(?=\.)/, "") !== direct.hostname || (app.port || "5432") !== (direct.port || "5432") || app.pathname !== direct.pathname) add("database", "DATABASE_TARGETS_DIFFER");
    }
  }
  if (DEMO_POLICY.hcsDailyLimitMaximum !== 100 || DEMO_POLICY.operationalRetentionDays !== 7 || DEMO_POLICY.contactRetentionDays !== 90) add("policy", "DELIVERY_POLICY_REVIEW_REQUIRED");
  return { code: issues.some(issue => issue.level === "error") ? "DELIVERY_CHECK_BLOCKED" : "CONFIGURATION_VALID_UNVERIFIED",
    profile, scope: "offline", network: "testnet", ok: !issues.some(issue => issue.level === "error"), configuration, issues,
    connectivity: "unchecked", accountsAndPlans: "unchecked", migrationsApplied: "unchecked", acceptance: "pending_S17_S18" };
}
