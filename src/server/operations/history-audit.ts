import type { Client } from "pg";
import { z } from "zod";
import { eventState, eventType } from "../../domain/event-schemas";
import { ApplicationError } from "../application-error";
import { readPublicEvent } from "../events/payload-core";
import { readReceiptResult, readRunOperation, readRunSnapshot } from "./storage-core";

const grams = z.string().regex(/^[0-9]+$/).transform(BigInt);
const runSchema = z.object({
  traceId: z.uuid(), state: eventState, version: z.number().int().positive(), scenarioVersion: z.string(), scenarioSnapshot: z.json(),
  declaredGrams: grams, humidityHundredths: z.number().int(), receivedGrams: grams.nullable(),
  assignedBuyerId: z.string().nullable(), assignedTripId: z.string().nullable(), assignedAt: z.coerce.date().nullable(),
  rejectionReasonCode: z.string().nullable(), incidentReasonCode: z.string().nullable(),
});
const eventSchema = z.object({
  id: z.uuid(), ordinal: z.number().int().positive(), type: eventType,
  simulatedRole: z.enum(["GENERATOR", "COORDINATOR", "CARRIER", "BUYER"]), appliedAt: z.coerce.date(),
  payloadVersion: z.number().int(), payload: z.json(), digest: z.string(),
});
const receiptSchema = z.object({ action: z.string(), resultingVersion: z.number().int().positive(), result: z.unknown() });

/** Ejecutá dentro de una transacción de solo lectura; el cursor acota memoria y no repara evidencia. */
export async function inspectOperationHistory(client: Client) {
  await client.query(`DECLARE s22_history NO SCROLL CURSOR FOR
    SELECT to_jsonb(r) || jsonb_build_object('declaredGrams',r."declaredGrams"::text,'receivedGrams',r."receivedGrams"::text) AS run,
      to_jsonb(c) AS receipt, to_jsonb(e) AS event, p."eventId" IS NOT NULL AS pending
    FROM "DemoRun" r LEFT JOIN "CommandReceipt" c ON c."runId"=r.id AND c.action <> 'RETRY_PUBLICATION'
    LEFT JOIN "OperationEvent" e ON e."commandId"=c.id LEFT JOIN "HcsPublication" p ON p."eventId"=e.id`);
  let inspected = 0, invalid = 0;
  try {
    for (;;) {
      const { rows } = await client.query<{ run: unknown; receipt: unknown; event: unknown; pending: boolean }>("FETCH FORWARD 100 FROM s22_history");
      if (rows.length === 0) break;
      for (const row of rows) {
        inspected++;
        const run = runSchema.safeParse(row.run);
        const receipt = receiptSchema.nullable().safeParse(row.receipt);
        const event = eventSchema.nullable().safeParse(row.event);
        if (!run.success || !receipt.success || !event.success) { invalid++; continue; }
        try {
          const snapshot = readRunSnapshot(run.data);
          readRunOperation(run.data, snapshot);
          if (receipt.data === null) {
            if (event.data !== null || run.data.state !== "DRAFT") throw new ApplicationError("INTERNAL_ERROR");
            continue;
          }
          const original = readReceiptResult(receipt.data.result, snapshot);
          if (receipt.data.resultingVersion > run.data.version || original.eventId !== (event.data?.id ?? null)
            || (receipt.data.action === "SAVE") !== (event.data === null)
            || (event.data === null && original.operation.state !== "DRAFT")) throw new ApplicationError("INTERNAL_ERROR");
          if (event.data !== null) {
            const { payload } = readPublicEvent(event.data, run.data.traceId, snapshot);
            if (!row.pending || payload.detail.state !== original.operation.state
              || payload.detail.quantityKg !== original.operation.quantityKg || payload.detail.humidityPercent !== original.operation.humidityPercent
              || payload.detail.receivedKg !== original.operation.receivedKg || (payload.detail.trip?.id ?? null) !== original.operation.assignedTripId
              || (payload.detail.reason?.code ?? null) !== (original.operation.rejectionReasonCode ?? original.operation.incidentReasonCode)) throw new ApplicationError("INTERNAL_ERROR");
          }
        } catch (error) {
          if (!(error instanceof ApplicationError)) throw error;
          invalid++;
        }
      }
    }
  } finally { await client.query("CLOSE s22_history"); }
  return { inspected, invalid, passed: invalid === 0 };
}
