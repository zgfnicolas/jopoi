import { connect } from "node:net";

/** Private named pipe / Unix socket, never an application HTTP endpoint. */
export function rpc<T>(socket: string, operation: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("TEST_IPC_ABORTED")); return; }
    const connection = connect(socket);
    let input = "";
    const onAbort = () => {
      reject(new Error("TEST_IPC_ABORTED"));
      connection.destroy();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    connection.setTimeout(30000, () => connection.destroy(new Error("TEST_IPC_TIMEOUT")));
    connection.on("close", () => signal?.removeEventListener("abort", onAbort));
    connection.on("error", reject);
    connection.on("connect", () => connection.write(JSON.stringify({ operation, data }) + "\n"));
    connection.on("data", chunk => {
      input += chunk;
      if (!input.includes("\n")) return;
      const response = JSON.parse(input.slice(0, input.indexOf("\n")));
      connection.end();
      if (response.error) reject(new Error(response.error));
      else resolve(response.value);
    });
    connection.on("end", () => { if (!input.includes("\n")) reject(new Error("TEST_IPC_DISCONNECTED")); });
  });
}
