import { z } from "zod";
import type { DemoRunResponse } from "@/shared/run-contracts";
import type { PublicTraceResponse } from "@/shared/trace-contracts";

export const operationStates = ["DRAFT", "PUBLISHED", "APPROVED", "ASSIGNED", "PICKED_UP", "RECEIVED", "REJECTED", "INCIDENT"] as const;
export const publicationStates = ["QUEUED", "IN_FLIGHT", "UNCERTAIN", "CONFIRMED", "FAILED", "PAUSED_QUOTA", "PAUSED_CONFIG"] as const;
export const verificationStates = ["NOT_CHECKED", "PENDING", "MATCHED", "MISMATCH", "UNAVAILABLE"] as const;
const date = z.iso.datetime({ precision: 3 });
const decimal = z.string().regex(/^\d+\.\d{3}$/);
const humidity = z.string().regex(/^\d+\.\d{2}$/);
const material = z.object({ id: z.string(), label: z.string() });
type DemoView = { session: DemoRunResponse["session"]; run: null | {
  traceId: string; expiresAt: string; scenario: { material: { id: string; label: string } };
  operation: Pick<NonNullable<DemoRunResponse["run"]>["operation"], "state" | "quantityKg" | "humidityPercent">;
} };
export const demoViewSchema: z.ZodType<DemoView> = z.object({
  session: z.object({ expiresAt: date, runCount: z.number().int().nonnegative(), remainingRuns: z.number().int().nonnegative() }),
  run: z.object({ traceId: z.uuid(), expiresAt: date, scenario: z.object({ material }),
    operation: z.object({ state: z.enum(operationStates), quantityKg: decimal, humidityPercent: humidity }) }).nullable(),
});
type TraceView = Pick<PublicTraceResponse, "traceId" | "expiresAt" | "state" | "declaration" | "reception"> & {
  scenario: Pick<PublicTraceResponse["scenario"], "disclaimer" | "generator" | "buyer"> & {
    material: { id: string; label: string }; route: { label: string; origin: string; destination: string };
  };
  events: { eventId: string; ordinal: number; type: PublicTraceResponse["events"][number]["type"];
    integrity: { state: "MATCHED" | "MISMATCH" }; publication: { state: typeof publicationStates[number] };
    storedVerification: { state: typeof verificationStates[number]; verifiedAt: string | null } }[];
};
const company = z.object({ id: z.string(), name: z.string(), isFictitious: z.literal(true) });
export const traceViewSchema: z.ZodType<TraceView> = z.object({
  version: z.literal(1), demo: z.literal(true), network: z.literal("testnet"), traceId: z.uuid(), expiresAt: date, state: z.enum(operationStates),
  scenario: z.object({ disclaimer: z.string(), material, generator: company, buyer: company,
    route: z.object({ label: z.string(), origin: z.string(), destination: z.string() }) }),
  declaration: z.object({ eventId: z.uuid(), quantityKg: decimal, humidityPercent: humidity }).nullable(),
  reception: z.object({ eventId: z.uuid(), outcome: z.enum(["RECEIVED", "INCIDENT"]), receivedKg: decimal,
    reason: z.object({ code: z.string(), label: z.string() }).nullable() }).nullable(),
  events: z.array(z.object({ eventId: z.uuid(), ordinal: z.number().int().positive(),
    type: z.enum(["LOT_PUBLISHED", "LOT_APPROVED", "LOT_REJECTED", "TRANSPORT_ASSIGNED", "PICKUP_CONFIRMED", "RECEIPT_ACCEPTED", "RECEIPT_ISSUE_REPORTED"]),
    integrity: z.object({ state: z.enum(["MATCHED", "MISMATCH"]) }), publication: z.object({ state: z.enum(publicationStates) }),
    storedVerification: z.object({ state: z.enum(verificationStates), verifiedAt: date.nullable() }),
  })),
});
export const demoExpiry = (data: DemoView) => data.run === null ? data.session.expiresAt :
  new Date(data.session.expiresAt) <= new Date(data.run.expiresAt) ? data.session.expiresAt : data.run.expiresAt;
export const traceExpiry = (data: TraceView) => data.expiresAt;
