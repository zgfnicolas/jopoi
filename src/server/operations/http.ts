import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DemoCommandInput, DemoCommandResponse } from "../../shared/run-contracts";
import { ApplicationError } from "../application-error";
import { apiBoundary, PRIVATE_RESPONSE_HEADERS, readJsonBody, requireBrowserMutation } from "../http";
import { SESSION_COOKIE } from "../sessions/credentials";
import { executeOperationCommand } from "./commands";
import { getCurrentRun, getOwnedRun } from "./queries";

const uuid = z.uuid().transform((value) => value.toLowerCase());
const common = {
  requestId: uuid,
  expectedVersion: z.number().int().positive().max(2147483647),
  role: z.enum(["generator", "coordinator", "carrier", "buyer"]),
};
// Forma estricta HTTP; precisión, catálogos y reglas se resuelven en S06/S07.
const commandBody: z.ZodType<DemoCommandInput> = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("save"), quantityKg: z.string(), humidityPercent: z.string() }),
  z.strictObject({ ...common, action: z.literal("publish"), quantityKg: z.string(), humidityPercent: z.string() }),
  z.strictObject({ ...common, action: z.literal("approve") }),
  z.strictObject({ ...common, action: z.literal("reject"), reasonCode: z.string() }),
  z.strictObject({ ...common, action: z.literal("assign"), tripId: z.string() }),
  z.strictObject({ ...common, action: z.literal("pickup") }),
  z.strictObject({ ...common, action: z.literal("receive"), receivedKg: z.string() }),
  z.strictObject({ ...common, action: z.literal("incident"), receivedKg: z.string(), reasonCode: z.string() }),
]);

interface TraceContext {
  readonly params: Promise<{ traceId: string }>;
}

async function traceFrom(context: TraceContext): Promise<string> {
  const parsed = uuid.safeParse((await context.params).traceId);
  if (!parsed.success) throw new ApplicationError("INVALID_INPUT", { traceId: ["Ingresá un identificador UUID válido."] });
  return parsed.data;
}

export async function getCurrentRunHttp(request: NextRequest): Promise<NextResponse> {
  return apiBoundary(async () => NextResponse.json(
    await getCurrentRun(request.cookies.get(SESSION_COOKIE)?.value), { headers: PRIVATE_RESPONSE_HEADERS },
  ));
}

export async function getOwnedRunHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary(async () => NextResponse.json(
    await getOwnedRun(request.cookies.get(SESSION_COOKIE)?.value, await traceFrom(context)),
    { headers: PRIVATE_RESPONSE_HEADERS },
  ));
}

export async function postCommandHttp(request: NextRequest, context: TraceContext): Promise<NextResponse> {
  return apiBoundary(async () => {
    requireBrowserMutation(request);
    const traceId = await traceFrom(context);
    const parsed = commandBody.safeParse(await readJsonBody(request, 4096));
    if (!parsed.success) throw new ApplicationError("INVALID_INPUT", {
      form: ["Ingresá una acción, rol, UUID, versión y únicamente los campos permitidos con sus tipos correctos."],
    });
    const { requestId, expectedVersion, ...command } = parsed.data;
    const result = await executeOperationCommand({
      token: request.cookies.get(SESSION_COOKIE)?.value, traceId, requestId, expectedVersion, command,
    });
    const body: DemoCommandResponse = {
      saved: true, traceId, replayed: result.replayed,
      applied: { operation: result.applied.operation, version: result.applied.version, eventId: result.applied.eventId },
      current: { operation: result.current.operation, version: result.current.version },
      event: result.event, publication: result.publication,
    };
    return NextResponse.json(body, { headers: PRIVATE_RESPONSE_HEADERS });
  });
}
