import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";

export function child(command: string, args: string[], env: NodeJS.ProcessEnv, log?: string): ChildProcess {
  const process = spawn(command, args, { env, windowsHide: true, shell: false,
    stdio: log ? ["ignore", "pipe", "pipe"] : "ignore" });
  if (log) {
    process.stdout?.on("data", chunk => appendFileSync(log, chunk));
    process.stderr?.on("data", chunk => appendFileSync(log, chunk));
  }
  return process;
}
export function completed(process: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    process.once("error", () => reject(new Error("TEST_PROCESS_UNAVAILABLE")));
    process.once("close", code => code === 0 ? resolve() : reject(new Error(`TEST_PROCESS_EXIT_${code}`)));
  });
}
export async function stop(process: ChildProcess | undefined): Promise<void> {
  if (!process?.pid || process.exitCode !== null) return;
  const exit = new Promise<void>(resolve => process.once("exit", () => resolve()));
  if (globalThis.process.platform === "win32") {
    // taskkill can report a process already gone before Node receives its exit event.
    // The bounded exit wait below decides whether stopping actually succeeded.
    await completed(child("taskkill", ["/PID", String(process.pid), "/T", "/F"], globalThis.process.env)).catch(() => {});
  } else process.kill("SIGKILL");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([exit, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("BLOCKED_TEST_PROCESS_STOP_TIMEOUT")), 5000); })]);
  } finally { clearTimeout(timer); }
}
