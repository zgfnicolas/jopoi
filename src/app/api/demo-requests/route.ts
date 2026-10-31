import { NextResponse } from "next/server";
import { DEMO_REQUEST_LIMITS } from "@/shared/contact-contracts";
import { parseDemoRequest } from "@/server/contacts/input";
import { submitDemoRequest } from "@/server/contacts/service";
import { apiBoundary, PRIVATE_RESPONSE_HEADERS, readJsonBody, requireBrowserMutation } from "@/server/http";
import { requireRateLimit } from "@/server/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  return apiBoundary("contacts.create", async () => {
    requireBrowserMutation(request);
    const input = parseDemoRequest(await readJsonBody(request, DEMO_REQUEST_LIMITS.bodyBytes));
    await requireRateLimit(request, "CONTACT");
    const result = await submitDemoRequest(input);
    return NextResponse.json(result.body, { status: result.created ? 201 : 200, headers: PRIVATE_RESPONSE_HEADERS });
  });
}
