import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRequestContext, toApiError } from "../api-errors";
import { ApplicationError } from "../application-error";
import { getServerConfig, requireConfiguration } from "../config";
import { SESSION_COOKIE } from "./credentials";
import { beginSession, recoverSession, resolveRunIntent } from "./service";

const emptyBody = z.strictObject({});
const runIntentBody = z.strictObject({ requestId: z.uuid().transform((value) => value.toLowerCase()) });
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const MAX_BODY_BYTES = 4096;

/** Origen configurado, nunca Host o X-Forwarded-Host aportados por el visitante. */
export function requireBrowserMutation(request: Request): void {
  const { url } = requireConfiguration(getServerConfig().origin());
  if (request.headers.get("origin") !== url || request.headers.get("x-jopoi-request") !== "demo") {
    throw new ApplicationError("REQUEST_FORBIDDEN");
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApplicationError("INVALID_INPUT");
  }
}

/** Acota el stream incluso si Content-Length falta o no describe su tamaño real. */
async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new ApplicationError("INVALID_INPUT");
  }
  if (request.body === null) throw new ApplicationError("INVALID_INPUT");
  const reader = request.body.getReader();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApplicationError("INVALID_INPUT");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApplicationError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}

async function boundary(work: () => Promise<NextResponse>): Promise<NextResponse> {
  const context = createRequestContext();
  try {
    return await work();
  } catch (error) {
    const result = toApiError(error, context);
    return NextResponse.json(result.body, { status: result.status, headers: privateHeaders });
  }
}

export async function getSession(request: NextRequest): Promise<NextResponse> {
  return boundary(async () => NextResponse.json(
    await recoverSession(request.cookies.get(SESSION_COOKIE)?.value),
    { headers: privateHeaders },
  ));
}

export async function postSession(request: NextRequest): Promise<NextResponse> {
  return boundary(async () => {
    requireBrowserMutation(request);
    if (!emptyBody.safeParse(await readBody(request)).success) throw new ApplicationError("INVALID_INPUT");
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
        maxAge: Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000)),
      });
    }
    return response;
  });
}

export function postRunIntent(kind: "START" | "RESET") {
  return async (request: NextRequest): Promise<NextResponse> => boundary(async () => {
    requireBrowserMutation(request);
    const parsed = runIntentBody.safeParse(await readBody(request));
    if (!parsed.success) throw new ApplicationError("INVALID_INPUT", { requestId: ["Ingresá un identificador UUID y solo los campos permitidos."] });
    const result = await resolveRunIntent(request.cookies.get(SESSION_COOKIE)?.value, parsed.data.requestId, kind);
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: privateHeaders });
  });
}
