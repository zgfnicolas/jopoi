import type { PoolConfig } from "pg";

/** No connection, environment lookup or credential-bearing errors. */
export function databaseConnection(url: string): PoolConfig {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("DATABASE_CONNECTION_POLICY");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase());
  if (local) return { connectionString: url, options: "-c timezone=UTC" };
  const options = [...parsed.searchParams.keys()];
  if (options.some(key => !["sslmode", "channel_binding"].includes(key) || parsed.searchParams.getAll(key).length !== 1)
    || !["require", "verify-ca", "verify-full"].includes(parsed.searchParams.get("sslmode") ?? "")
    || parsed.searchParams.has("channel_binding") && parsed.searchParams.get("channel_binding") !== "require") {
    throw new Error("DATABASE_CONNECTION_POLICY");
  }
  // pg connection-string SSL options replace the ssl object; remove them first.
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");
  return { connectionString: parsed.href, ssl: { rejectUnauthorized: true }, enableChannelBinding: true, options: "-c timezone=UTC" };
}

/** Prisma migrate uses a URL, not our pg PoolConfig. Preserve strict verification. */
export function migrationConnection(url: string): string {
  const connection = databaseConnection(url);
  if (!connection.ssl) return url;
  const parsed = new URL(connection.connectionString!);
  parsed.searchParams.set("sslmode", "verify-full");
  return parsed.href;
}
