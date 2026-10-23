BEGIN;

CREATE TYPE "SessionIntentKind" AS ENUM ('START', 'RESET');
CREATE UNIQUE INDEX "DemoRun_id_sessionId_key" ON "DemoRun"("id", "sessionId");

CREATE TABLE "SessionRunIntent" (
  "sessionId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "kind" "SessionIntentKind" NOT NULL,
  "runId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRunIntent_pkey" PRIMARY KEY ("sessionId", "requestId"),
  CONSTRAINT "SessionRunIntent_runId_sessionId_fkey" FOREIGN KEY ("runId", "sessionId")
    REFERENCES "DemoRun"("id", "sessionId") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "SessionRunIntent_runId_sessionId_idx" ON "SessionRunIntent"("runId", "sessionId");

-- S03 precede a los reinicios: las intenciones de creación existentes son START.
INSERT INTO "SessionRunIntent" ("sessionId", "requestId", "kind", "runId", "createdAt")
SELECT "sessionId", "creationRequestId", 'START', "id", "createdAt" FROM "DemoRun";

COMMIT;
