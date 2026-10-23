import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma, type CommandAction, type SimulatedRole as SqlRole } from "../../generated/prisma/client";
import { canonicalJson } from "../../domain/canonical-json";
import { decideOperation, normalizeOperationCommand } from "../../domain/operations";
import type { PersistedCommandResult } from "../../shared/event-contracts";
import type { OperationAction, OperationCommand, SimulatedRole } from "../../shared/operation-contracts";
import { ApplicationError } from "../application-error";
import { advanceRunVersion, withTransaction } from "../database";
import { createPublicEvent, eventTypeForAction, readPublicEvent } from "../events/payload";
import { configuredTarget } from "../hedera/target";
import { publicationSummary } from "../hedera/summary";
import { sessionTokenHash } from "../sessions/credentials";
import { requireOwnedRun } from "../sessions/service";
import { jsonObject, readRunOperation, readRunSnapshot, receiptResultSchema, runChanges } from "./storage";

export interface OperationCommandInput {
  readonly token?: string;
  readonly traceId: string;
  readonly requestId: string;
  readonly expectedVersion: number;
  readonly command: OperationCommand;
}

const metadataSchema = z.strictObject({
  traceId: z.uuid().transform((value) => value.toLowerCase()),
  requestId: z.uuid().transform((value) => value.toLowerCase()),
  expectedVersion: z.number().int().positive().max(2147483647),
});
const ACTIONS: Readonly<Record<OperationAction, CommandAction>> = {
  save: "SAVE", publish: "PUBLISH", approve: "APPROVE", reject: "REJECT",
  assign: "ASSIGN", pickup: "PICKUP", receive: "RECEIVE", incident: "INCIDENT",
};
const ROLES: Readonly<Record<SimulatedRole, SqlRole>> = {
  generator: "GENERATOR", coordinator: "COORDINATOR", carrier: "CARRIER", buyer: "BUYER",
};

/** Entrada privada para S08; no realiza envío, reserva de cuota ni confirmación de red. */
export async function executeOperationCommand(input: OperationCommandInput): Promise<PersistedCommandResult> {
  const metadata = metadataSchema.safeParse({ traceId: input.traceId, requestId: input.requestId, expectedVersion: input.expectedVersion });
  if (!metadata.success) throw new ApplicationError("INVALID_INPUT", { form: ["Ingresá identificadores UUID y una versión positiva válida."] });
  const { traceId, requestId, expectedVersion } = metadata.data;
  const tokenHash = sessionTokenHash(input.token);

  async function resolve(tx: Prisma.TransactionClient, allowWrite: boolean): Promise<PersistedCommandResult> {
    const { run, session } = await requireOwnedRun(tx, tokenHash, traceId);
    const snapshot = readRunSnapshot(run);
    const current = readRunOperation(run);
    const normalized = normalizeOperationCommand(input.command, snapshot);
    if (!normalized.ok) throw new ApplicationError(normalized.error.code, normalized.error.fields);
    const command = normalized.value;
    const intentHash = createHash("sha256").update(canonicalJson({ version: 1, expectedVersion, command }), "utf8").digest("hex");
    const previous = await tx.commandReceipt.findUnique({
      where: { runId_requestId: { runId: run.id, requestId } },
      include: { event: { include: { publication: true } } },
    });
    if (previous !== null) {
      if (previous.intentHash !== intentHash) throw new ApplicationError("IDEMPOTENCY_CONFLICT");
      const original = receiptResultSchema.safeParse(previous.result);
      if (!original.success || previous.action !== ACTIONS[command.action] || previous.resultingVersion > run.version
        || original.data.eventId !== (previous.event?.id ?? null)
        || (previous.event === null) !== (command.action === "save")) throw new ApplicationError("INTERNAL_ERROR");
      const event = previous.event === null ? null : readPublicEvent(previous.event, run.traceId);
      const publication = previous.event?.publication ?? null;
      if (event !== null && publication === null) throw new ApplicationError("INTERNAL_ERROR");
      if (event !== null && (event.payload.detail.state !== original.data.operation.state
        || event.payload.detail.quantityKg !== original.data.operation.quantityKg
        || event.payload.detail.humidityPercent !== original.data.operation.humidityPercent
        || event.payload.detail.receivedKg !== original.data.operation.receivedKg
        || (event.payload.detail.trip?.id ?? null) !== original.data.operation.assignedTripId
        || (event.payload.detail.reason?.code ?? null) !== (original.data.operation.rejectionReasonCode ?? original.data.operation.incidentReasonCode))) {
        throw new ApplicationError("INTERNAL_ERROR");
      }
      return {
        replayed: true,
        applied: { operation: original.data.operation, version: previous.resultingVersion, eventId: original.data.eventId },
        current: { operation: current, version: run.version }, event,
        publication: publication === null ? null : publicationSummary(publication),
      };
    }
    if (!allowWrite || run.version !== expectedVersion) throw new ApplicationError("VERSION_CONFLICT");
    if (run.version === 2147483647) throw new ApplicationError("STATE_CONFLICT");
    const decision = decideOperation(current, command, snapshot);
    if (!decision.ok) throw new ApplicationError(decision.error.code, decision.error.fields);
    const operation = decision.value.operation;
    const type = eventTypeForAction(command.action);
    if (decision.value.createsMilestone !== (type !== null)) throw new ApplicationError("INTERNAL_ERROR");
    const appliedAt = new Date();
    if (session.expiresAt.getTime() <= appliedAt.getTime()) throw new ApplicationError("SESSION_EXPIRED");
    if (run.expiresAt.getTime() <= appliedAt.getTime()) throw new ApplicationError("NOT_FOUND");
    const eventId = type === null ? null : randomUUID();
    const latest = type === null ? null : await tx.operationEvent.aggregate({ where: { runId: run.id }, _max: { ordinal: true } });
    const event = type === null || eventId === null ? null : createPublicEvent({
      traceId: run.traceId, eventId, ordinal: (latest?._max.ordinal ?? 0) + 1,
      type, role: command.role, appliedAt, operation, snapshot,
    });
    const resultingVersion = expectedVersion + 1;
    // La unicidad reclama la intención; cualquier conflicto posterior revierte también este recibo.
    const receipt = await tx.commandReceipt.create({
      data: {
        runId: run.id, requestId, intentHash, action: ACTIONS[command.action], resultingVersion, createdAt: appliedAt,
        result: jsonObject({ version: 1, operation, eventId }),
      }, select: { id: true },
    });
    await advanceRunVersion(tx, run.id, expectedVersion);
    const target = command.action === "publish" ? configuredTarget(process.env) : null;
    await tx.demoRun.update({ where: { id: run.id }, data: {
      ...runChanges(operation, command.action, appliedAt),
      ...(target === null ? {} : { hcsConfigurationGeneration: target.generation, hcsTopicId: target.topicId, hcsOperatorId: target.operatorId }),
    }, select: { id: true } });
    let publication = null;
    if (event !== null) {
      const stored = await tx.operationEvent.create({ data: {
        id: event.payload.eventId, runId: run.id, commandId: receipt.id,
        ordinal: event.payload.ordinal, type: event.payload.type, simulatedRole: ROLES[command.role],
        appliedAt, payloadVersion: 1, payload: jsonObject(event.payload), digest: event.digest,
        publication: { create: { network: "testnet", state: "QUEUED", verificationState: "NOT_CHECKED",
          automaticAttempts: 0, manualAttempts: 0, nextAttemptAt: appliedAt, createdAt: appliedAt } },
      }, include: { publication: true } });
      publication = stored.publication;
      if (publication === null) throw new ApplicationError("INTERNAL_ERROR");
    }
    return {
      replayed: false, applied: { operation, version: resultingVersion, eventId },
      current: { operation, version: resultingVersion }, event,
      publication: publication === null ? null : publicationSummary(publication),
    };
  }

  try {
    return await withTransaction((tx) => resolve(tx, true));
  } catch (error) {
    const conflict = error instanceof ApplicationError && error.code === "VERSION_CONFLICT"
      || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!conflict) throw error;
    // Snapshot nuevo y nueva autorización, solo lectura. Nunca reintentar una escritura automáticamente.
    return withTransaction((tx) => resolve(tx, false));
  }
}
