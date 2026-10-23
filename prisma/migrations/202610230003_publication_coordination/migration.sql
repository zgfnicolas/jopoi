BEGIN;

CREATE TYPE "HcsAttemptKind" AS ENUM ('AUTOMATIC', 'MANUAL');
CREATE TYPE "HcsAttemptState" AS ENUM ('RESERVED', 'STARTED', 'UNCERTAIN', 'REJECTED', 'CONFIRMED');
ALTER TABLE "HcsPublication" ADD COLUMN "manualAuthorizedAt" TIMESTAMPTZ(3);

CREATE TABLE "HcsSubmissionAttempt" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventId" UUID NOT NULL REFERENCES "HcsPublication"("eventId") ON DELETE CASCADE ON UPDATE NO ACTION,
  "slot" SMALLINT NOT NULL CHECK ("slot" BETWEEN 1 AND 4),
  "kind" "HcsAttemptKind" NOT NULL,
  "state" "HcsAttemptState" NOT NULL DEFAULT 'RESERVED',
  "transactionId" VARCHAR(128) NOT NULL UNIQUE,
  "signedTransactionBytes" BYTEA NOT NULL CHECK (octet_length("signedTransactionBytes") BETWEEN 1 AND 65536),
  "topicId" VARCHAR(64) NOT NULL CHECK ("topicId" ~ '^0[.]0[.][1-9][0-9]*$'),
  "operatorId" VARCHAR(64) NOT NULL CHECK ("operatorId" ~ '^0[.]0[.][1-9][0-9]*$'),
  "configurationGeneration" VARCHAR(64) NOT NULL CHECK ("configurationGeneration" ~ '^[a-f0-9]{64}$'),
  "quotaDate" DATE NOT NULL,
  "startedAt" TIMESTAMPTZ(3), "finishedAt" TIMESTAMPTZ(3),
  "proof" VARCHAR(16) NOT NULL DEFAULT 'NONE' CHECK ("proof" IN ('NONE','NOT_SENT','PRECHECK','RECEIPT','MIRROR')),
  "lastErrorCode" VARCHAR(64), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HcsSubmissionAttempt_slot_kind" CHECK (("kind" = 'AUTOMATIC' AND "slot" <= 3) OR ("kind" = 'MANUAL' AND "slot" = 4)),
  CONSTRAINT "HcsSubmissionAttempt_eventId_slot_key" UNIQUE ("eventId", "slot")
);
CREATE INDEX "HcsSubmissionAttempt_eventId_state_idx" ON "HcsSubmissionAttempt"("eventId", "state");
CREATE TABLE "MaintenanceLease" (
  "name" VARCHAR(32) NOT NULL PRIMARY KEY CHECK ("name" = 'DAILY_MAINTENANCE'),
  "owner" UUID, "expiresAt" TIMESTAMPTZ(3), "lastCompletedDate" DATE,
  CHECK (num_nonnulls("owner", "expiresAt") IN (0, 2))
);
CREATE INDEX "HcsPublication_due_idx" ON "HcsPublication"("nextAttemptAt", "eventId");

-- Migrate legacy preparations conservatively: a durable old boundary is uncertain,
-- never proof of rejection/absence. Unsent preparations need no attempt reservation yet.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "HcsPublication" p WHERE (p."automaticAttempts" > 0 OR p."manualAttempts" > 0)
    AND p."transactionId" IS NULL) THEN RAISE EXCEPTION 'HCS_COUNTERS_WITHOUT_PREPARATION_REQUIRE_REVIEW'; END IF;
END $$;
INSERT INTO "HcsSubmissionAttempt" ("id", "eventId", "slot", "kind", "state", "transactionId", "signedTransactionBytes",
  "topicId", "operatorId", "configurationGeneration", "quotaDate", "startedAt", "proof", "createdAt")
SELECT p."eventId", p."eventId", CASE WHEN p."manualAttempts" > 0 THEN 4 ELSE GREATEST(1,p."automaticAttempts") END,
  CASE WHEN p."manualAttempts" > 0 THEN 'MANUAL'::"HcsAttemptKind" ELSE 'AUTOMATIC'::"HcsAttemptKind" END,
  CASE WHEN p."state" = 'CONFIRMED' THEN 'CONFIRMED'::"HcsAttemptState" ELSE 'UNCERTAIN'::"HcsAttemptState" END,
  p."transactionId", p."signedTransactionBytes", p."topicId", r."hcsOperatorId", p."configurationGeneration",
  (p."updatedAt" AT TIME ZONE 'UTC')::date, p."updatedAt", 'NONE', p."createdAt"
FROM "HcsPublication" p JOIN "OperationEvent" e ON e.id=p."eventId" JOIN "DemoRun" r ON r.id=e."runId"
WHERE p."transactionId" IS NOT NULL AND (p."automaticAttempts" > 0 OR p."manualAttempts" > 0 OR EXISTS (
 SELECT 1 FROM jsonb_array_elements(p."attemptHistory") x WHERE x->>'boundary'='SUBMISSION_STARTED' AND x->>'transactionId'=p."transactionId"));
UPDATE "HcsPublication" p SET "automaticAttempts"=GREATEST(p."automaticAttempts",1)
WHERE p."manualAttempts"=0 AND EXISTS (SELECT 1 FROM "HcsSubmissionAttempt" a WHERE a."eventId"=p."eventId");

CREATE FUNCTION jopoi_protect_submission_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id",NEW."eventId",NEW."slot",NEW."kind",NEW."createdAt") IS DISTINCT FROM
    ROW(OLD."id",OLD."eventId",OLD."slot",OLD."kind",OLD."createdAt") OR
    (OLD."startedAt" IS NOT NULL AND OLD."proof" <> 'NOT_SENT' AND
     ROW(NEW."transactionId",NEW."signedTransactionBytes",NEW."topicId",NEW."operatorId",NEW."configurationGeneration",NEW."startedAt",NEW."quotaDate") IS DISTINCT FROM
     ROW(OLD."transactionId",OLD."signedTransactionBytes",OLD."topicId",OLD."operatorId",OLD."configurationGeneration",OLD."startedAt",OLD."quotaDate")) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Submission attempt identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "HcsSubmissionAttempt_immutable" BEFORE UPDATE ON "HcsSubmissionAttempt"
 FOR EACH ROW EXECUTE FUNCTION jopoi_protect_submission_attempt();
COMMIT;
