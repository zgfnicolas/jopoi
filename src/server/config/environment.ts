import { z } from "zod";

import { DEMO_POLICY, HEDERA_NETWORK } from "../../shared/demo-policy";

/** Parser privado sin acceso a process.env: también reutilizable por futuros CLI. */
export type Environment = Readonly<Record<string, string | undefined>>;

const ENVIRONMENT_VARIABLES = [
  "NODE_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "SESSION_SECRET",
  "CRON_SECRET",
  "APP_URL",
  "HEDERA_OPERATOR_ID",
  "HEDERA_OPERATOR_KEY",
  "HEDERA_TOPIC_ID",
  "HCS_DAILY_LIMIT",
] as const;

export type EnvironmentVariable = (typeof ENVIRONMENT_VARIABLES)[number];
export type ConfigCapability =
  | "database"
  | "migrations"
  | "session"
  | "maintenance"
  | "origin"
  | "hedera";

export interface ConfigurationIssue {
  readonly variable: EnvironmentVariable;
  readonly reason: "missing" | "invalid";
}

interface ConfigurationMetadata {
  readonly capability: ConfigCapability;
  readonly availability: "unchecked";
}

export type ConfigurationResult<T> = ConfigurationMetadata & (
  | { readonly status: "configured"; readonly config: T }
  | { readonly status: "missing" | "invalid"; readonly issues: readonly ConfigurationIssue[] }
);

export type ConfigurationSummary = ConfigurationMetadata & (
  | { readonly status: "configured" }
  | { readonly status: "missing" | "invalid"; readonly issues: readonly ConfigurationIssue[] }
);

const postgresUrl = z.string().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) && url.hostname.length > 0;
});

const secret = z.string().min(32).regex(/^\S+$/);
const hederaId = z.string().regex(/^0\.0\.[1-9]\d*$/);
const dailyLimit = z.string().regex(/^[1-9]\d*$/).transform(Number)
  .pipe(z.number().int().min(1).max(DEMO_POLICY.hcsDailyLimitMaximum))
  .default(DEMO_POLICY.hcsDailyLimitDefault);

const databaseSchema = z.object({ DATABASE_URL: postgresUrl })
  .transform((value) => ({ url: value.DATABASE_URL }));
const migrationsSchema = z.object({ DIRECT_URL: postgresUrl })
  .transform((value) => ({ url: value.DIRECT_URL }));
const sessionSchema = z.object({ SESSION_SECRET: secret })
  .transform((value) => ({ secret: value.SESSION_SECRET }));
const maintenanceSchema = z.object({ CRON_SECRET: secret })
  .transform((value) => ({ secret: value.CRON_SECRET }));
const hederaSchema = z.object({
  HEDERA_OPERATOR_ID: hederaId,
  HEDERA_OPERATOR_KEY: z.string().min(1),
  HEDERA_TOPIC_ID: hederaId,
  HCS_DAILY_LIMIT: dailyLimit,
}).transform((value) => ({
  network: HEDERA_NETWORK,
  operatorId: value.HEDERA_OPERATOR_ID,
  operatorKey: value.HEDERA_OPERATOR_KEY,
  topicId: value.HEDERA_TOPIC_ID,
  dailyLimit: value.HCS_DAILY_LIMIT,
}));

const originSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().optional(),
}).superRefine((value, context) => {
  if (value.APP_URL === undefined) {
    if (value.NODE_ENV === "production") {
      context.addIssue({ code: "custom", path: ["APP_URL"], message: "Origen requerido." });
    }
    return;
  }

  if (!URL.canParse(value.APP_URL)) {
    context.addIssue({ code: "custom", path: ["APP_URL"], message: "Origen inválido." });
    return;
  }

  const url = new URL(value.APP_URL);
  const localHttp = value.NODE_ENV !== "production"
    && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const valid = (url.protocol === "https:" || localHttp)
    && url.username === "" && url.password === ""
    && url.pathname === "/" && url.search === "" && url.hash === ""
    && /^https?:\/\/[^\s/?#\\@]+\/?$/i.test(value.APP_URL);

  if (!valid) {
    context.addIssue({ code: "custom", path: ["APP_URL"], message: "Origen inválido." });
  }
}).transform((value) => ({
  url: new URL(value.APP_URL ?? "http://127.0.0.1:3000").origin,
}));

/** No valida ni conecta hasta que se solicita una capacidad. */
export function createConfigReader(environment: Environment) {
  const values: Environment = Object.fromEntries(ENVIRONMENT_VARIABLES.map((name) => [
    name,
    environment[name]?.trim() || undefined,
  ]));

  function read<Schema extends z.ZodType>(
    capability: ConfigCapability,
    schema: Schema,
  ): ConfigurationResult<z.output<Schema>> {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      return { capability, status: "configured", availability: "unchecked", config: parsed.data };
    }

    // No devolver ZodError: podría contener mensajes o metadatos de entradas privadas.
    const issues: ConfigurationIssue[] = [];
    for (const issue of parsed.error.issues) {
      const variable = ENVIRONMENT_VARIABLES.find((name) => name === issue.path[0]);
      if (variable !== undefined && !issues.some((entry) => entry.variable === variable)) {
        issues.push({ variable, reason: values[variable] === undefined ? "missing" : "invalid" });
      }
    }

    return {
      capability,
      status: issues.length > 0 && issues.every((issue) => issue.reason === "missing") ? "missing" : "invalid",
      availability: "unchecked",
      issues,
    };
  }

  return {
    database: () => read("database", databaseSchema),
    migrations: () => read("migrations", migrationsSchema),
    session: () => read("session", sessionSchema),
    maintenance: () => read("maintenance", maintenanceSchema),
    origin: () => read("origin", originSchema),
    hedera: () => read("hedera", hederaSchema),
  };
}

/** Resumen interno sin valores: no serializar nunca ConfigurationResult.config. */
export function describeConfiguration<T>(result: ConfigurationResult<T>): ConfigurationSummary {
  const metadata = { capability: result.capability, availability: result.availability };
  return result.status === "configured"
    ? { ...metadata, status: "configured" }
    : { ...metadata, status: result.status, issues: result.issues };
}
