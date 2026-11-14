import { NextResponse } from "next/server";
import { apiBoundary } from "@/server/http";
import { checkReadiness } from "@/server/monitoring/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return apiBoundary("health.ready", request, async () => {
    const result = await checkReadiness();
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  });
}
