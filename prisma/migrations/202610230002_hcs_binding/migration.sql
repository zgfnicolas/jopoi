BEGIN;

-- S09 is the first implementation capable of preparing a network transaction.
-- Unexpected earlier preparations require explicit review, never an invented binding.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "HcsPublication" WHERE "transactionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'HCS_PREEXISTING_PREPARATION_REQUIRES_REVIEW';
  END IF;
END $$;

ALTER TABLE "DemoRun"
  ADD COLUMN "hcsConfigurationGeneration" VARCHAR(64),
  ADD COLUMN "hcsTopicId" VARCHAR(64),
  ADD COLUMN "hcsOperatorId" VARCHAR(64),
  ADD CONSTRAINT "DemoRun_hcs_binding" CHECK (
    num_nonnulls("hcsConfigurationGeneration", "hcsTopicId", "hcsOperatorId") IN (0, 3)
    AND ("hcsConfigurationGeneration" IS NULL OR "hcsConfigurationGeneration" ~ '^[a-f0-9]{64}$')
    AND ("hcsTopicId" IS NULL OR "hcsTopicId" ~ '^0[.]0[.][1-9][0-9]*$')
    AND ("hcsOperatorId" IS NULL OR "hcsOperatorId" ~ '^0[.]0[.][1-9][0-9]*$')
  );
ALTER TABLE "HcsPublication"
  ADD COLUMN "verificationEvidence" JSONB,
  ADD CONSTRAINT "HcsPublication_verification_evidence" CHECK (
    "verificationEvidence" IS NULL OR jsonb_typeof("verificationEvidence") = 'object'
  );

CREATE FUNCTION jopoi_protect_hcs_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."hcsConfigurationGeneration" IS NOT NULL AND
    ROW(NEW."hcsConfigurationGeneration", NEW."hcsTopicId", NEW."hcsOperatorId") IS DISTINCT FROM
    ROW(OLD."hcsConfigurationGeneration", OLD."hcsTopicId", OLD."hcsOperatorId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'DemoRun_hcs_binding_immutable', MESSAGE = 'HCS binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DemoRun_hcs_binding_immutable" BEFORE UPDATE ON "DemoRun"
  FOR EACH ROW EXECUTE FUNCTION jopoi_protect_hcs_binding();

COMMIT;
