import { NextResponse } from "next/server";
import { apiBoundary } from "@/server/http";
import { checkLiveness } from "@/server/monitoring/health";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return apiBoundary("health.live", request, async () => {
    const result = checkLiveness();
    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  });
}
