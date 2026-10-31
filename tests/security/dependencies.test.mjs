import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { test } from "node:test";

// Resolvé desde el SDK: un ws seguro en la raíz no protege una copia transitiva vieja.
const requireFromProject = createRequire(import.meta.url);
const requireFromSdk = createRequire(requireFromProject.resolve("@hiero-ledger/sdk"));
const requireFromEthers = createRequire(requireFromSdk.resolve("ethers"));
const WebSocket = requireFromEthers("ws");
const { WebSocketServer } = WebSocket;

/**
 * Usá sólo loopback y pocos bytes: comprobamos el rechazo, no agotamos memoria.
 * @param {import("node:test").TestContext} context
 * @param {Record<string, unknown>} options
 */
async function connectedPair(context, options = {}) {
  const server = new WebSocketServer({ ...options, host: "127.0.0.1", port: 0 });
  const sockets = new Set();
  // Registrá el peer aunque el cliente falle antes de completar su handshake y devolverlo al test.
  server.on("connection", socket => sockets.add(socket));
  context.after(async () => {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await once(server, "listening");
  const address = server.address();
  assert(address !== null && typeof address !== "string");
  const connection = once(server, "connection");
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`, { handshakeTimeout: 1000 });
  sockets.add(client);
  await once(client, "open");
  const [peer] = await connection;
  return { client, peer };
}

test("S22-07: el transporte del SDK intercambia datos y cierra con los bytes exactos de un Uint8Array", { timeout: 5000 }, async context => {
  const { client, peer } = await connectedPair(context);
  const message = once(peer, "message");
  client.send("mensaje sintético");
  const [payload] = await message;
  assert.equal(payload.toString(), "mensaje sintético");

  const closed = once(client, "close");
  peer.close(1000, new Uint8Array(80));
  const [code, reason] = await closed;
  assert.equal(code, 1000);
  assert.deepEqual(reason, Buffer.alloc(80));
});

test("S22-07: el cierre rechaza TypedArray que podrían exponer memoria sin inicializar", { timeout: 5000 }, async context => {
  const { peer } = await connectedPair(context);
  assert.throws(() => peer.close(1000, new Float32Array(20)), TypeError);
});

test("S22-07: el transporte del SDK limita fragmentos pequeños antes de agotar memoria", { timeout: 5000 }, async context => {
  const { client, peer } = await connectedPair(context, { maxFragments: 4 });
  const outcome = Promise.all([once(peer, "error"), once(client, "close")]);
  for (let fragment = 0; fragment < 5; fragment++) {
    client.send(Buffer.from("a"), { fin: false });
  }
  const [[error], [code]] = await outcome;
  assert.equal(error.code, "WS_ERR_TOO_MANY_BUFFERED_PARTS");
  assert.equal(code, 1008);
});
