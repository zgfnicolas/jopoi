import { defineConfig } from "prisma/config";
import { loadCliEnvironment } from "./src/server/config/cli-environment";
import { createConfigReader } from "./src/server/config/environment";

loadCliEnvironment();
const migrations = createConfigReader(process.env).migrations();

// generate/validate no necesitan base; migrate exige DIRECT_URL o DATABASE_URL_UNPOOLED explícita.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(migrations.status === "configured" ? { datasource: { url: migrations.config.url } } : {}),
});
