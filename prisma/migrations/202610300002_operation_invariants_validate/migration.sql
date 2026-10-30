BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
-- No reescribas evidencia: un dato incompatible debe detener el despliegue.
ALTER TABLE "DemoRun" VALIDATE CONSTRAINT "DemoRun_state_coherence";
COMMIT;
