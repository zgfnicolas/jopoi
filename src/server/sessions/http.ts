import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { emptyBody, runIntentBody } from "../../shared/request-contracts";
import type { DemoSessionResponse } from "../../shared/session-contracts";
import { ApplicationError } from "../application-error";
import { apiBoundary as boundary, PRIVATE_RESPONSE_HEADERS as privateHeaders, readJsonBody, requireBrowserMutation } from "../http";
import { csrfToken, extractSessionCredentials, HOST_SESSION_COOKIE, SESSION_COOKIE, sessionCookiePolicy } from "./credentials";
import { beginSession, recoverSession, resolveRunIntent, revokeSession } from "./service";
import { requireRateLimit, requireSessionRateLimit } from "../security/rate-limit";

const MAX_BODY_BYTES = 4096;

export { requireBrowserMutation } from "../http";

export async function getSession(request: NextRequest): Promise<NextResponse> {
  return boundary("session.read", request, async () => {
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "PRIVATE_READ");
    const data = await recoverSession(token);
    const csrf = csrfToken(token);
    const body: DemoSessionResponse = csrf ? { ...data, csrfToken: csrf } : data;
    const headers = new Headers(privateHeaders);
    if (csrf) headers.set("X-CSRF-Token", csrf);
    const response = NextResponse.json(body, { headers });
    if (creds.isHttps && creds.legacyMigrating && token !== undefined) {
      const expires = new Date(data.session.expiresAt);
      response.cookies.set(HOST_SESSION_COOKIE, token, {
        ...sessionCookiePolicy(true),
        expires,
        maxAge: Math.max(0, Math.floor((expires.getTime() - wallNow().getTime()) / 1000)),
      });
      response.cookies.set(SESSION_COOKIE, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
    return response;
  });
}

export async function postSession(request: NextRequest): Promise<NextResponse> {
  return boundary("session.create", request, async () => {
    requireBrowserMutation(request);
    if (!emptyBody.safeParse(await readJsonBody(request, MAX_BODY_BYTES)).success) throw new ApplicationError("INVALID_INPUT");
    await requireRateLimit(request, "SESSION");
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const result = await beginSession(creds.token);
    const effectiveToken = result.token ?? creds.token;
    const csrf = csrfToken(effectiveToken);
    const body: DemoSessionResponse = csrf ? { ...result.body, csrfToken: csrf } : result.body;
    const headers = new Headers(privateHeaders);
    if (csrf) headers.set("X-CSRF-Token", csrf);
    const response = NextResponse.json(body, { status: result.created ? 201 : 200, headers });
    const isHttps = creds.isHttps;
    if (result.token !== undefined) {
      const expires = new Date(result.body.session.expiresAt);
      const policy = sessionCookiePolicy(isHttps);
      response.cookies.set(policy.name, result.token, {
        ...policy,
        expires,
        maxAge: Math.max(0, Math.floor((expires.getTime() - wallNow().getTime()) / 1000)),
      });
      if (isHttps) {
        response.cookies.set(SESSION_COOKIE, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
      }
    } else if (isHttps && creds.legacyMigrating && creds.token !== undefined) {
      const expires = new Date(result.body.session.expiresAt);
      response.cookies.set(HOST_SESSION_COOKIE, creds.token, {
        ...sessionCookiePolicy(true),
        expires,
        maxAge: Math.max(0, Math.floor((expires.getTime() - wallNow().getTime()) / 1000)),
      });
      response.cookies.set(SESSION_COOKIE, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
    return response;
  });
}

export function postRunIntent(kind: "START" | "RESET") {
  return async (request: NextRequest): Promise<NextResponse> => boundary(kind === "START" ? "runs.start" : "runs.reset", request, async () => {
    requireBrowserMutation(request);
    const parsed = runIntentBody.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
    if (!parsed.success) throw new ApplicationError("INVALID_INPUT", { requestId: ["Ingresá un identificador UUID y solo los campos permitidos."] });
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    const token = creds.token;
    await requireSessionRateLimit(token, "MUTATION");
    const result = await resolveRunIntent(token, parsed.data.requestId, kind);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: privateHeaders });
  });
}

export async function deleteSession(request: NextRequest): Promise<NextResponse> {
  return boundary("session.delete", request, async () => {
    requireBrowserMutation(request);
    const creds = extractSessionCredentials(request);
    if (creds.ambiguous) throw new ApplicationError("SESSION_REQUIRED");
    if (creds.token !== undefined) {
      await revokeSession(creds.token);
    }
    const response = new NextResponse(null, { status: 204, headers: privateHeaders });
    response.cookies.set(HOST_SESSION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    response.cookies.set(SESSION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
    });
    return response;
  });
}
