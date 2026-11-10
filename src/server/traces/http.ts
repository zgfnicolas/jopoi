import "server-only";
import { bindBusinessTraceId, type HttpOperation } from "../diagnostics";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApplicationError } from "../application-error";
import { apiBoundary } from "../http";
import { publicTraceReader } from "./queries";
import { requireRateLimit } from "../security/rate-limit";
import { computeTraceEtag, matchesIfNoneMatch } from "../operations/etag";

const uuid = z.uuid().transform(value => value.toLowerCase());
const traceParams = z.strictObject({ traceId: uuid });
const verificationParams = z.strictObject({ traceId: uuid, eventId: uuid });

function resolveRequestPath(request: Request): string {
  if ("nextUrl" in request && (request as NextRequest).nextUrl?.pathname) {
    return (request as NextRequest).nextUrl.pathname;
  }
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

async function publicBoundary(
  operation: HttpOperation,
  request: Request,
  work: () => Promise<NextResponse>,
  legacyLink?: string,
): Promise<NextResponse> {
  const response = await apiBoundary(operation, request, work);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Accept");
  if (legacyLink) {
    response.headers.set("Deprecation", "true");
    response.headers.set("Link", `<${legacyLink}>; rel="successor-version"`);
  }
  return response;
}

export async function getTraceHttp(
  request: NextRequest,
  context: { params: Promise<{ traceId: string }> },
  options?: { isLegacy?: boolean },
) {
  const resolvedParams = await context.params;
  const pathname = resolveRequestPath(request);
  const isLegacy = options?.isLegacy ?? !pathname.startsWith("/api/v1/");
  const operation: HttpOperation = isLegacy ? "traces.read" : "traces.v1.read";
  const legacyLink = isLegacy ? `/api/v1/traces/${resolvedParams.traceId}` : undefined;

  return publicBoundary(
    operation,
    request,
    async () => {
      const params = traceParams.safeParse(resolvedParams);
      if (!params.success) throw new ApplicationError("INVALID_INPUT");
      bindBusinessTraceId(params.data.traceId);
      await requireRateLimit(request, "TRACE");
      const trace = await publicTraceReader().getTrace(params.data.traceId);
      const etag = computeTraceEtag(trace);
      const ifNoneMatch = request.headers.get("if-none-match");

      if (matchesIfNoneMatch(ifNoneMatch, etag)) {
        return new NextResponse(null, {
          status: 304,
          headers: { ETag: etag },
        });
      }

      return NextResponse.json(trace, {
        status: 200,
        headers: { ETag: etag },
      });
    },
    legacyLink,
  );
}

export async function getVerificationHttp(
  request: NextRequest,
  context: { params: Promise<{ traceId: string; eventId: string }> },
  options?: { isLegacy?: boolean },
) {
  const resolvedParams = await context.params;
  const pathname = resolveRequestPath(request);
  const isLegacy = options?.isLegacy ?? !pathname.startsWith("/api/v1/");
  const operation: HttpOperation = isLegacy ? "traces.verify" : "traces.v1.verify";
  const legacyLink = isLegacy
    ? `/api/v1/traces/${resolvedParams.traceId}/events/${resolvedParams.eventId}/verification`
    : undefined;

  return publicBoundary(
    operation,
    request,
    async () => {
      const params = verificationParams.safeParse(resolvedParams);
      if (!params.success) throw new ApplicationError("INVALID_INPUT");
      bindBusinessTraceId(params.data.traceId);
      await requireRateLimit(request, "VERIFICATION");
      const verification = await publicTraceReader().getVerification(params.data.traceId, params.data.eventId);
      const etag = computeTraceEtag(verification);
      const ifNoneMatch = request.headers.get("if-none-match");

      if (matchesIfNoneMatch(ifNoneMatch, etag)) {
        return new NextResponse(null, {
          status: 304,
          headers: { ETag: etag },
        });
      }

      return NextResponse.json(verification, {
        status: 200,
        headers: { ETag: etag },
      });
    },
    legacyLink,
  );
}
