BEGIN;

-- Outbox telemetría (D05, D13, D18): contexto mínimo para correlación distribuida entre días.
ALTER TABLE "HcsPublication"
  ADD COLUMN "telemetryTraceId" VARCHAR(32),
  ADD COLUMN "telemetrySpanId" VARCHAR(16);

COMMIT;
