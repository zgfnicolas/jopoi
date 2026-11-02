ALTER TABLE "RequestRateBucket"
  DROP CONSTRAINT IF EXISTS "RequestRateBucket_scope_check";

ALTER TABLE "RequestRateBucket"
  ADD CONSTRAINT "RequestRateBucket_scope_check" CHECK (
    "scope" IN (
      'SESSION',
      'CONTACT',
      'VERIFICATION',
      'TRACE',
      'SESSION_CREATE',
      'CONTACT_CREATE',
      'PRIVATE_READ',
      'MUTATION',
      'PUBLICATION',
      'INTENT_CREATE',
      'RUN_INTENT',
      'SESSION_INTENT'
    )
  );

ALTER TABLE "RequestRateBucket"
  DROP CONSTRAINT IF EXISTS "RequestRateBucket_used_check";

ALTER TABLE "RequestRateBucket"
  ADD CONSTRAINT "RequestRateBucket_used_check" CHECK (
    "used" > 0 AND (
      ("scope" = 'INTENT_CREATE' AND "used" <= 5000) OR
      ("scope" <> 'INTENT_CREATE' AND "used" <= 1000)
    )
  );
