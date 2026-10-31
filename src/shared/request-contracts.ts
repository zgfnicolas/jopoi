import { z } from "zod";
import type { DemoCommandInput } from "./run-contracts";
const uuid = z.uuid().transform(value => value.toLowerCase());
export const emptyBody = z.strictObject({});
export const runIntentBody = z.strictObject({ requestId: uuid });
const common = {
  requestId: uuid,
  expectedVersion: z.number().int().positive().max(2147483647),
  role: z.enum(["generator", "coordinator", "carrier", "buyer"]),
};
// Forma estricta HTTP; precisión, catálogos y reglas se resuelven en S06/S07.
export const commandBody: z.ZodType<DemoCommandInput> = z.discriminatedUnion("action", [
  z.strictObject({ ...common, action: z.literal("save"), quantityKg: z.string(), humidityPercent: z.string() }),
  z.strictObject({ ...common, action: z.literal("publish"), quantityKg: z.string(), humidityPercent: z.string() }),
  z.strictObject({ ...common, action: z.literal("approve") }),
  z.strictObject({ ...common, action: z.literal("reject"), reasonCode: z.string() }),
  z.strictObject({ ...common, action: z.literal("assign"), tripId: z.string() }),
  z.strictObject({ ...common, action: z.literal("pickup") }),
  z.strictObject({ ...common, action: z.literal("receive"), receivedKg: z.string() }),
  z.strictObject({ ...common, action: z.literal("incident"), receivedKg: z.string(), reasonCode: z.string() }),
]);
