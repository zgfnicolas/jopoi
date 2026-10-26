import { now as wallNow } from "@/server/runtime/clock";
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApplicationError } from "../application-error";
import { apiBoundary as boundary, PRIVATE_RESPONSE_HEADERS as privateHeaders, readJsonBody, requireBrowserMutation } from "../http";
import { SESSION_COOKIE } from "./credentials";
import { beginSession, recoverSession, resolveRunIntent } from "./service";

const emptyBody = z.strictObject({});
const runIntentBody = z.strictObject({ requestId: z.uuid().transform((value) => value.toLowerCase()) });
const MAX_BODY_BYTES = 4096;

export { requireBrowserMutation } from "../http";

export async function getSession(request: NextRequest): Promise<NextResponse> {
  return boundary(async () => NextResponse.json(
    await recoverSession(request.cookies.get(SESSION_COOKIE)?.value),
    { headers: privateHeaders },
  ));
}

export async function postSession(request: NextRequest): Promise<NextResponse> {
  return boundary(async () => {
    requireBrowserMutation(request);
    if (!emptyBody.safeParse(await readJsonBody(request, MAX_BODY_BYTES)).success) throw new ApplicationError("INVALID_INPUT");
    const result = await beginSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json(result.body, { status: result.created ? 201 : 200, headers: privateHeaders });
    if (result.token !== undefined) {
      const expires = new Date(result.body.session.expiresAt);
      response.cookies.set(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires,
        maxAge: Math.max(0, Math.floor((expires.getTime() - wallNow().getTime()) / 1000)),
      });
    }
    return response;
  });
}

export function postRunIntent(kind: "START" | "RESET") {
  return async (request: NextRequest): Promise<NextResponse> => boundary(async () => {
    requireBrowserMutation(request);
    const parsed = runIntentBody.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
    if (!parsed.success) throw new ApplicationError("INVALID_INPUT", { requestId: ["Ingresá un identificador UUID y solo los campos permitidos."] });
    const result = await resolveRunIntent(request.cookies.get(SESSION_COOKIE)?.value, parsed.data.requestId, kind);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: privateHeaders });
  });
}
