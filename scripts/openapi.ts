import { readFile, writeFile } from "node:fs/promises";
import { buildOpenApi } from "./lib/openapi";
const text = JSON.stringify(buildOpenApi(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile("public/openapi.json", "utf8") !== text) throw new Error("OPENAPI_OUTDATED: ejecutá npm run api:generate y revisá el contrato.");
} else await writeFile("public/openapi.json", text);
