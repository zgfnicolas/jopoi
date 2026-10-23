import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ApplicationError } from "@/server/application-error";
import { createConfigReader } from "@/server/config/environment";
import { apiBoundary } from "@/server/http";
import { runMaintenance } from "@/server/hedera/maintenance-core";
import { serverCoordinationContext } from "@/server/hedera/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const response = await apiBoundary(async () => {
    const config = createConfigReader(process.env).maintenance();
    if (config.status !== "configured") throw new ApplicationError("CONFIGURATION_UNAVAILABLE");
    const expected = Buffer.from(`Bearer ${config.config.secret}`);
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApplicationError("MAINTENANCE_UNAUTHORIZED");
    return NextResponse.json(await runMaintenance(serverCoordinationContext()), { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
  });
  response.headers.set("Vary", "Authorization");
  return response;
}
