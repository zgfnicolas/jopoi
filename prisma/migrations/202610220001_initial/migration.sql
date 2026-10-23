BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunState" AS ENUM ('DRAFT', 'PUBLISHED', 'APPROVED', 'ASSIGNED', 'PICKED_UP', 'RECEIVED', 'REJECTED', 'INCIDENT');

-- CreateEnum
CREATE TYPE "SimulatedRole" AS ENUM ('GENERATOR', 'COORDINATOR', 'CARRIER', 'BUYER');

-- CreateEnum
CREATE TYPE "CommandAction" AS ENUM ('SAVE', 'PUBLISH', 'APPROVE', 'REJECT', 'ASSIGN', 'PICKUP', 'RECEIVE', 'INCIDENT', 'RETRY_PUBLICATION');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('LOT_PUBLISHED', 'LOT_APPROVED', 'LOT_REJECTED', 'TRANSPORT_ASSIGNED', 'PICKUP_CONFIRMED', 'RECEIPT_ACCEPTED', 'RECEIPT_ISSUE_REPORTED');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('QUEUED', 'IN_FLIGHT', 'UNCERTAIN', 'CONFIRMED', 'FAILED', 'PAUSED_QUOTA', 'PAUSED_CONFIG');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('NOT_CHECKED', 'PENDING', 'MATCHED', 'MISMATCH', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "runCount" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRun" (
    "id" UUID NOT NULL,
    "traceId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "creationRequestId" UUID NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" "RunState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "scenarioVersion" VARCHAR(64) NOT NULL,
    "scenarioSnapshot" JSONB NOT NULL,
    "declaredGrams" BIGINT NOT NULL,
    "humidityHundredths" SMALLINT NOT NULL,
    "assignedBuyerId" VARCHAR(64),
    "assignedTripId" VARCHAR(64),
    "assignedAt" TIMESTAMPTZ(3),
    "receivedGrams" BIGINT,
    "rejectionReasonCode" VARCHAR(64),
    "incidentReasonCode" VARCHAR(64),

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "intentHash" VARCHAR(64) NOT NULL,
    "action" "CommandAction" NOT NULL,
    "resultingVersion" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationEvent" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "commandId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "type" "EventType" NOT NULL,
    "simulatedRole" "SimulatedRole" NOT NULL,
    "appliedAt" TIMESTAMPTZ(3) NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "digest" VARCHAR(64) NOT NULL,

    CONSTRAINT "OperationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcsPublication" (
    "eventId" UUID NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'QUEUED',
    "verificationState" "VerificationState" NOT NULL DEFAULT 'NOT_CHECKED',
    "network" VARCHAR(16) NOT NULL DEFAULT 'testnet',
    "topicId" VARCHAR(64),
    "configurationGeneration" VARCHAR(64),
    "transactionId" VARCHAR(128),
    "signedTransactionBytes" BYTEA,
    "attemptHistory" JSONB NOT NULL DEFAULT '[]',
    "automaticAttempts" SMALLINT NOT NULL DEFAULT 0,
    "manualAttempts" SMALLINT NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "leaseOwner" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastErrorCode" VARCHAR(64),
    "confirmedAt" TIMESTAMPTZ(3),
    "sequenceNumber" BIGINT,
    "consensusTimestamp" VARCHAR(30),
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HcsPublication_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "DailyQuota" (
    "scope" VARCHAR(32) NOT NULL,
    "date" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyQuota_pkey" PRIMARY KEY ("scope","date")
);

-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "intentHash" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DemoSession_expiresAt_idx" ON "DemoSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRun_traceId_key" ON "DemoRun"("traceId");

-- CreateIndex
CREATE INDEX "DemoRun_expiresAt_idx" ON "DemoRun"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRun_sessionId_creationRequestId_key" ON "DemoRun"("sessionId", "creationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRun_sessionId_ordinal_key" ON "DemoRun"("sessionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_runId_requestId_key" ON "CommandReceipt"("runId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_id_runId_key" ON "CommandReceipt"("id", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationEvent_runId_ordinal_key" ON "OperationEvent"("runId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "OperationEvent_commandId_runId_key" ON "OperationEvent"("commandId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "HcsPublication_transactionId_key" ON "HcsPublication"("transactionId");

-- CreateIndex
CREATE INDEX "HcsPublication_state_nextAttemptAt_idx" ON "HcsPublication"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "HcsPublication_leaseExpiresAt_idx" ON "HcsPublication"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "DailyQuota_date_idx" ON "DailyQuota"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DemoRequest_requestId_key" ON "DemoRequest"("requestId");

-- CreateIndex
CREATE INDEX "DemoRequest_expiresAt_idx" ON "DemoRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DemoSession"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CommandReceipt" ADD CONSTRAINT "CommandReceipt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DemoRun"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_commandId_runId_fkey" FOREIGN KEY ("commandId", "runId") REFERENCES "CommandReceipt"("id", "runId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "HcsPublication" ADD CONSTRAINT "HcsPublication_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OperationEvent"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Constraints and triggers are part of this migration, not inferred by Prisma.
ALTER TABLE "DemoSession"
  ADD CONSTRAINT "DemoSession_token_hash" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "DemoSession_run_count" CHECK ("runCount" BETWEEN 0 AND 3),
  ADD CONSTRAINT "DemoSession_expiration" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "DemoRun"
  ADD CONSTRAINT "DemoRun_ordinal" CHECK ("ordinal" BETWEEN 1 AND 3),
  ADD CONSTRAINT "DemoRun_version" CHECK ("version" > 0),
  ADD CONSTRAINT "DemoRun_declared_grams" CHECK ("declaredGrams" > 0),
  ADD CONSTRAINT "DemoRun_humidity" CHECK ("humidityHundredths" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "DemoRun_received_grams" CHECK ("receivedGrams" IS NULL OR "receivedGrams" > 0),
  ADD CONSTRAINT "DemoRun_assignment" CHECK (num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt") IN (0, 3)),
  ADD CONSTRAINT "DemoRun_expiration" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "DemoRun_snapshot" CHECK (
    jsonb_typeof("scenarioSnapshot") = 'object'
    AND "scenarioSnapshot" ? 'version'
    AND jsonb_typeof("scenarioSnapshot" -> 'version') = 'string'
    AND "scenarioSnapshot" ->> 'version' = "scenarioVersion"
    AND ("scenarioSnapshot" -> 'isIllustrative' = 'true'::jsonb) IS TRUE
  );

ALTER TABLE "CommandReceipt"
  ADD CONSTRAINT "CommandReceipt_intent_hash" CHECK ("intentHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "CommandReceipt_version" CHECK ("resultingVersion" > 0),
  ADD CONSTRAINT "CommandReceipt_result" CHECK (jsonb_typeof("result") = 'object');

ALTER TABLE "OperationEvent"
  ADD CONSTRAINT "OperationEvent_ordinal" CHECK ("ordinal" > 0),
  ADD CONSTRAINT "OperationEvent_payload_version" CHECK ("payloadVersion" > 0),
  ADD CONSTRAINT "OperationEvent_payload" CHECK (jsonb_typeof("payload") = 'object'),
  ADD CONSTRAINT "OperationEvent_digest" CHECK ("digest" ~ '^[a-f0-9]{64}$');

ALTER TABLE "HcsPublication"
  ADD CONSTRAINT "HcsPublication_network" CHECK ("network" = 'testnet'),
  ADD CONSTRAINT "HcsPublication_automatic_attempts" CHECK ("automaticAttempts" BETWEEN 0 AND 3),
  ADD CONSTRAINT "HcsPublication_manual_attempts" CHECK ("manualAttempts" BETWEEN 0 AND 1),
  ADD CONSTRAINT "HcsPublication_history" CHECK (jsonb_typeof("attemptHistory") = 'array'),
  ADD CONSTRAINT "HcsPublication_lease" CHECK (num_nonnulls("leaseOwner", "leaseExpiresAt") IN (0, 2)),
  ADD CONSTRAINT "HcsPublication_sequence" CHECK ("sequenceNumber" IS NULL OR "sequenceNumber" > 0),
  ADD CONSTRAINT "HcsPublication_timestamp" CHECK ("consensusTimestamp" IS NULL OR "consensusTimestamp" ~ '^[0-9]+[.][0-9]{9}$'),
  ADD CONSTRAINT "HcsPublication_topic" CHECK ("topicId" IS NULL OR "topicId" ~ '^0[.]0[.][1-9][0-9]*$'),
  ADD CONSTRAINT "HcsPublication_preparation" CHECK (
    ("transactionId" IS NULL AND "signedTransactionBytes" IS NULL)
    OR ("transactionId" IS NOT NULL AND "signedTransactionBytes" IS NOT NULL
      AND "topicId" IS NOT NULL AND "configurationGeneration" IS NOT NULL)
  );

ALTER TABLE "DailyQuota"
  ADD CONSTRAINT "DailyQuota_scope" CHECK ("scope" = 'HCS_GLOBAL'),
  ADD CONSTRAINT "DailyQuota_used" CHECK ("used" BETWEEN 0 AND 100);

ALTER TABLE "DemoRequest"
  ADD CONSTRAINT "DemoRequest_intent_hash" CHECK ("intentHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "DemoRequest_required_fields" CHECK (length(btrim("name")) > 0 AND length(btrim("email")) > 0 AND length(btrim("company")) > 0),
  ADD CONSTRAINT "DemoRequest_expiration" CHECK ("expiresAt" > "createdAt");

CREATE FUNCTION jopoi_protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'OperationEvent_immutable', MESSAGE = 'OperationEvent is immutable';
END;
$$;

CREATE TRIGGER "OperationEvent_immutable"
  BEFORE UPDATE ON "OperationEvent" FOR EACH ROW EXECUTE FUNCTION jopoi_protect_event();

CREATE FUNCTION jopoi_protect_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."traceId", NEW."sessionId", NEW."creationRequestId", NEW."ordinal", NEW."createdAt", NEW."expiresAt", NEW."scenarioVersion", NEW."scenarioSnapshot")
    IS DISTINCT FROM ROW(OLD."id", OLD."traceId", OLD."sessionId", OLD."creationRequestId", OLD."ordinal", OLD."createdAt", OLD."expiresAt", OLD."scenarioVersion", OLD."scenarioSnapshot") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'DemoRun_snapshot_identity_immutable', MESSAGE = 'Run identity and scenario are immutable';
  END IF;
  IF OLD."state" <> 'DRAFT' AND (NEW."state" = 'DRAFT'
    OR NEW."declaredGrams" IS DISTINCT FROM OLD."declaredGrams"
    OR NEW."humidityHundredths" IS DISTINCT FROM OLD."humidityHundredths") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'DemoRun_published_declaration_immutable', MESSAGE = 'Published declaration is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DemoRun_immutable_fields"
  BEFORE UPDATE ON "DemoRun" FOR EACH ROW EXECUTE FUNCTION jopoi_protect_run();

COMMIT;
