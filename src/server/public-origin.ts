import "server-only";
import { getServerConfig } from "./config";

/** Only the public origin crosses the RSC boundary. Missing configuration never blocks a public read. */
export function getPublicOrigin(): string | null {
  const result = getServerConfig().origin();
  return result.status === "configured" ? result.config.url : null;
}
