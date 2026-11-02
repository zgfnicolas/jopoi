BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "RequestRateBucket"
  DROP CONSTRAINT "RequestRateBucket_scope_check",
  ADD CONSTRAINT "RequestRateBucket_scope_check" CHECK ("scope" IN (
    'SESSION',
    'CONTACT',
    'VERIFICATION',
    'TRACE',
    'SESSION_CREATE',
    'CONTACT_CREATE'
  ));
COMMIT;
