import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import type { TestResources } from "./runtime-provision";

const port = z.number().int().min(1).max(65535);
const markerSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), pgPort: port, httpPort: port, secondaryHttpPort: port });
const resourceSchema = markerSchema.extend({ directory: z.string(), databaseUrl: z.string(), applicationUrl: z.string(), socket: z.string().min(1), pgBin: z.string().min(1) });

/** Comprobá pertenencia antes de iniciar procesos o modificar una base de fixtures. */
export async function ownedResources(input: unknown): Promise<TestResources> {
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) throw new Error("TEST_RESOURCES_INVALID");
  const resources = parsed.data;
  const root = resolve(".cache/api-tests") + sep;
  const directory = resolve(resources.directory);
  if (!directory.startsWith(root) || !z.uuid().safeParse(directory.slice(root.length)).success) throw new Error("TEST_RESOURCES_NOT_OWNED");
  // La segunda instancia usa secondaryHttpPort como httpPort dentro del mismo clúster.
  if (resources.pgPort === resources.httpPort || resources.pgPort === resources.secondaryHttpPort) throw new Error("TEST_RESOURCE_PORT_COLLISION");
  for (const connection of [resources.databaseUrl, resources.applicationUrl]) {
    let url: URL;
    try { url = new URL(connection); } catch { throw new Error("TEST_DATABASE_NOT_OWNED"); }
    if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== String(resources.pgPort) || url.pathname !== "/s17_api") throw new Error("TEST_DATABASE_NOT_OWNED");
  }
  const marker = markerSchema.safeParse(JSON.parse(await readFile(resolve(directory, "owner.json"), "utf8")));
  if (!marker.success || marker.data.token !== resources.token || marker.data.pgPort !== resources.pgPort
    || ![marker.data.httpPort, marker.data.secondaryHttpPort].includes(resources.httpPort)
    || ![marker.data.httpPort, marker.data.secondaryHttpPort].includes(resources.secondaryHttpPort)) throw new Error("TEST_RESOURCES_NOT_OWNED");
  const socket = process.platform === "win32" ? `\\\\.\\pipe\\jopoi-s17-${resources.token}` : resolve(directory, "ledger.sock");
  if (resources.socket !== socket || !resolve(resources.pgBin).startsWith(resolve(".tools/postgresql") + sep)) throw new Error("TEST_RESOURCES_NOT_OWNED");
  return resources;
}

export async function readOwnedResources(file: string): Promise<TestResources> {
  return ownedResources(JSON.parse(await readFile(file, "utf8")));
}
