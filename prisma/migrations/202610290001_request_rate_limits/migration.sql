BEGIN;
CREATE TABLE "RequestRateBucket" (
  "scope" VARCHAR(16) NOT NULL CHECK ("scope" IN ('SESSION','CONTACT','VERIFICATION','TRACE')),
  "subject" VARCHAR(64) NOT NULL CHECK ("subject" = 'GLOBAL' OR "subject" ~ '^[a-f0-9]{64}$'),
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "used" INTEGER NOT NULL CHECK ("used" > 0 AND "used" <= 1000),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL CHECK ("expiresAt" > "windowStart"),
  CONSTRAINT "RequestRateBucket_pkey" PRIMARY KEY ("scope","subject","windowStart")
);
CREATE INDEX "RequestRateBucket_expiresAt_idx" ON "RequestRateBucket"("expiresAt");
REVOKE EXECUTE ON FUNCTION jopoi_protect_event(),jopoi_protect_run(),jopoi_protect_hcs_binding(),jopoi_protect_submission_attempt() FROM PUBLIC;
COMMIT;
