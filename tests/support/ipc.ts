import { connect } from "node:net";

/** Private named pipe / Unix socket, never an application HTTP endpoint. */
export function rpc<T>(socket: string, operation: string, data?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const connection = connect(socket);
    let input = "";
    connection.setTimeout(30000, () => connection.destroy(new Error("TEST_IPC_TIMEOUT")));
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
