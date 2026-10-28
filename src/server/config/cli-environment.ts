import { config, parse } from "dotenv";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ENVIRONMENT_VARIABLES } from "./environment";

export class CliEnvironmentError extends Error {
  constructor(readonly code: "INVALID_CLI_ARGUMENTS" | "ENVIRONMENT_FILE_UNAVAILABLE" | "INVALID_ENVIRONMENT_FILE") { super(code); }
}

/** Entry points use node --import tsx -- so Node never interprets the application's --env-file. */
/** Parse the selector without loading its file, so --help never touches credentials. */
export type EnvironmentFileFormat = "strict" | "vercel";
export function environmentOption(input: readonly string[]): { args: string[]; file?: string; format: EnvironmentFileFormat } {
  const args: string[] = [];
  let file: string | undefined;
  let format: EnvironmentFileFormat = "strict";
  for (let index = 0; index < input.length; index++) {
    if (!["--env-file", "--vercel-env-file"].includes(input[index])) { args.push(input[index]); continue; }
    const selector = input[index];
    const value = input[++index];
    if (file !== undefined || !value?.trim() || value.startsWith("--")) throw new CliEnvironmentError("INVALID_CLI_ARGUMENTS");
    file = value;
    format = selector === "--vercel-env-file" ? "vercel" : "strict";
  }
  return { args, format, ...(file === undefined ? {} : { file }) };
}

function selectedValues(root: string, file: string, format: EnvironmentFileFormat): Record<string, string> {
  let values: Record<string, string>;
  try {
    const path = resolve(root, file);
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 65536) throw new Error();
    values = parse(readFileSync(path));
  } catch { throw new CliEnvironmentError("ENVIRONMENT_FILE_UNAVAILABLE"); }
  if (format === "strict" && Object.keys(values).some(key => !ENVIRONMENT_VARIABLES.some(name => name === key))) throw new CliEnvironmentError("INVALID_ENVIRONMENT_FILE");
  return Object.fromEntries(Object.entries(values).filter(([key]) => ENVIRONMENT_VARIABLES.some(name => name === key)));
}

/** Explicit selection seals every known key, including missing ones, against later dotenv/Next fallback. */
export function loadCliEnvironment(root = process.cwd(), file?: string, format: EnvironmentFileFormat = "strict"): void {
  if (file !== undefined) {
    const values = selectedValues(root, file, format);
    Object.assign(process.env, Object.fromEntries(ENVIRONMENT_VARIABLES.map(name => [name, values[name] ?? ""])));
    return;
  }
  // Existing default: process wins, then .env.local and .env. Defined empty keys remain sealed.
  config({ path: [resolve(root, ".env.local"), resolve(root, ".env")], override: false, quiet: true });
}
