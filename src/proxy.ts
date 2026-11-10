import type { NextRequest } from "next/server";
import { handleTraceProxyRequest } from "@/server/traces/page-boundary";

export async function proxy(request: NextRequest) {
  return handleTraceProxyRequest(request);
}

export const config = {
  matcher: ["/trazabilidad/:path*"],
};
