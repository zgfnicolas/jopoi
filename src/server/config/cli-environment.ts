import { config } from "dotenv";
import { resolve } from "node:path";

/** CLI privado: process.env prevalece, luego .env.local y .env; sin imprimir valores. */
export function loadCliEnvironment(root = process.cwd()): void {
  config({ path: [resolve(root, ".env.local"), resolve(root, ".env")], override: false, quiet: true });
}
