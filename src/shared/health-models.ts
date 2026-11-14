import { z } from "zod";

export const healthLiveSchema = z.strictObject({
  status: z.literal("live"),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime({ precision: 3 }),
  runtime: z.strictObject({
    memoryBytes: z.number().int().nonnegative(),
    eventLoopDelayMs: z.number().nonnegative(),
  }),
});
export type HealthLiveResponse = z.infer<typeof healthLiveSchema>;

export const healthReadySchema = z.strictObject({
  status: z.literal("ready"),
  degraded: z.boolean(),
  timestamp: z.iso.datetime({ precision: 3 }),
  checks: z.strictObject({
    database: z.strictObject({
      status: z.literal("available"),
      latencyMs: z.number().int().nonnegative(),
    }),
    hedera: z.strictObject({
      status: z.enum(["available", "degraded", "unconfigured"]),
      details: z.string(),
    }),
  }),
});
export type HealthReadyResponse = z.infer<typeof healthReadySchema>;

export const healthStartupSchema = z.strictObject({
  status: z.literal("started"),
  runtime: z.literal("serverless"),
  initializedAt: z.iso.datetime({ precision: 3 }),
});
export type HealthStartupResponse = z.infer<typeof healthStartupSchema>;
