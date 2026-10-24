import { z } from "zod";
import { snapshotSchema } from "@/domain/scenario-schema";
import { eventDigest, eventUuid, operationDataSchema, publicEventSchema } from "@/domain/event-schemas";
import { PUBLICATION_RETRY_OUTCOMES } from "@/shared/event-contracts";
import type { DemoCommandResponse, DemoRunResponse } from "@/shared/run-contracts";
import type { DemoRunIntentResponse, DemoSessionResponse } from "@/shared/session-contracts";
import type { PublicationRetryResponse } from "@/shared/event-contracts";
import { operationStates, publicationStates, verificationStates } from "./read-models";

const date = z.iso.datetime({ precision: 3 });
const integer = z.number().int().nonnegative();
const version = z.number().int().positive().max(2147483647);
const money = z.string().regex(/^-?\d+\.\d{2}$/);
export const sessionSummarySchema = z.object({ expiresAt: date, runCount: integer, remainingRuns: integer });
const runSummary = z.object({ traceId: eventUuid, state: z.enum(operationStates), version, expiresAt: date });
export const sessionResponseSchema: z.ZodType<DemoSessionResponse> = z.object({ session: sessionSummarySchema, activeRun: runSummary.nullable() });
export const runIntentSchema: z.ZodType<DemoRunIntentResponse> = z.object({ session: sessionSummarySchema, run: runSummary, created: z.boolean(), replayed: z.boolean() });
const quota = z.object({ limit: integer.nullable(), used: integer, remaining: integer.nullable(), resetsAt: date });
const publication = z.object({ blockedBy: eventUuid.nullable(), quota,
  state: z.enum(publicationStates), verificationState: z.enum(verificationStates), network: z.literal("testnet"),
  topicId: z.string().nullable(), transactionId: z.string().nullable(), sequenceNumber: z.string().nullable(),
  consensusTimestamp: z.string().nullable(), confirmedAt: date.nullable(), verifiedAt: date.nullable(), lastErrorCode: z.string().nullable(),
  automaticAttempts: integer, manualAttempts: integer, manualAuthorized: z.boolean(), manualAvailable: z.boolean(), nextAttemptAt: date.nullable(),
});
const event = z.object({ payload: publicEventSchema, digest: eventDigest });
export const operationViewSchema: z.ZodType<DemoRunResponse> = z.object({ session: sessionSummarySchema, run: z.object({
  traceId: eventUuid, version, expiresAt: date, operation: operationDataSchema, scenario: snapshotSchema,
  compatibility: z.array(z.object({ tripId: z.string(), isCompatible: z.boolean(), checks: z.array(z.object({
    code: z.enum(["MATERIAL", "CAPACITY", "BODY_TYPE", "ROUTE", "PICKUP_WINDOW"]), isCompatible: z.boolean(), message: z.string(),
  })) })),
  economics: z.object({ currency: z.literal("ARS"), isIllustrative: z.literal(true), disclaimer: z.string(), quantityKg: z.string(),
    materialCost: money, returnFreight: money, jopoiFee: money, jopoiTotal: money, dedicatedFreight: money, alternativeTotal: money,
    difference: money, differenceKind: z.enum(["saving", "extra_cost", "equal"]) }),
  quota, events: z.array(z.object({ event, publication })),
}).nullable() });
export const commandResponseSchema: z.ZodType<DemoCommandResponse> = z.object({ saved: z.literal(true), traceId: eventUuid, replayed: z.boolean(),
  applied: z.object({ operation: operationDataSchema, version, eventId: eventUuid.nullable() }),
  current: z.object({ operation: operationDataSchema, version }), event: event.nullable(), publication: publication.nullable(),
}).refine(value => value.current.version >= value.applied.version && (value.event === null
  ? value.applied.eventId === null && value.publication === null
  : value.publication !== null && value.applied.eventId === value.event.payload.eventId
    && value.traceId === value.event.payload.traceId && value.applied.operation.state === value.event.payload.detail.state));
export const retryResponseSchema: z.ZodType<PublicationRetryResponse> = z.object({ saved: z.literal(true), replayed: z.boolean(), traceId: eventUuid,
  eventId: eventUuid, outcome: z.enum(PUBLICATION_RETRY_OUTCOMES), publication, quota });
