import { resolve } from "node:path";
import type { TestResources } from "./runtime-provision";

export function sealedEnvironment(resources: TestResources): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development", DATABASE_URL: resources.applicationUrl, DIRECT_URL: resources.databaseUrl, DATABASE_URL_UNPOOLED: "",
    SESSION_SECRET: "synthetic-session-secret-for-s17-only", CRON_SECRET: "synthetic-cron-secret-for-s17-only",
    APP_URL: `http://127.0.0.1:${resources.httpPort}`, HEDERA_OPERATOR_ID: "0.0.17",
    HEDERA_OPERATOR_KEY: "11".repeat(32), HEDERA_TOPIC_ID: "0.0.170", HCS_CONFIGURATION_GENERATION: "s17",
    HCS_DAILY_LIMIT: "100", JOPOI_API_TEST_DIRECTORY: resources.directory, JOPOI_API_TEST_TOKEN: resources.token,
    JOPOI_API_TEST_SOCKET: resources.socket, TSX_TSCONFIG_PATH: resolve("tsconfig.api.json"),
    NEXT_TELEMETRY_DISABLED: "1", VERCEL: "", NODE_OPTIONS: "",
  };
}
