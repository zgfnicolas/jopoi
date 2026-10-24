import { z } from "zod";
import type { DemoRunResponse } from "@/shared/run-contracts";

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
export const demoExpiry = (data: DemoView) => data.run === null ? data.session.expiresAt :
  new Date(data.session.expiresAt) <= new Date(data.run.expiresAt) ? data.session.expiresAt : data.run.expiresAt;
