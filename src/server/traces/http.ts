import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApplicationError } from "../application-error";
import { apiBoundary } from "../http";
import { publicTraceReader } from "./queries";

const uuid = z.uuid().transform(value => value.toLowerCase());
const traceParams = z.strictObject({ traceId: uuid });
const verificationParams = z.strictObject({ traceId: uuid, eventId: uuid });

async function publicBoundary(work: () => Promise<unknown>) {
  const response = await apiBoundary(async () => NextResponse.json(await work()));
  response.headers.set("Cache-Control", "no-store");
  response.headers.delete("Vary");
  return response;
}
export async function getTraceHttp(_request: NextRequest, context: { params: Promise<{ traceId: string }> }) {
  return publicBoundary(async () => {
    const params = traceParams.safeParse(await context.params);
    if (!params.success) throw new ApplicationError("INVALID_INPUT");
    return publicTraceReader().getTrace(params.data.traceId);
  });
}
export async function getVerificationHttp(_request: NextRequest, context: { params: Promise<{ traceId: string; eventId: string }> }) {
  return publicBoundary(async () => {
    const params = verificationParams.safeParse(await context.params);
    if (!params.success) throw new ApplicationError("INVALID_INPUT");
    return publicTraceReader().getVerification(params.data.traceId, params.data.eventId);
  });
}
