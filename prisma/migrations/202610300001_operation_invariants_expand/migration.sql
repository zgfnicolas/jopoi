BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- NOT VALID separa la expansión del escaneo histórico; las escrituras nuevas ya se controlan.
ALTER TABLE "DemoRun" ADD CONSTRAINT "DemoRun_state_coherence" CHECK ((
  CASE
    WHEN state IN ('DRAFT', 'PUBLISHED', 'APPROVED') THEN
      num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams", "rejectionReasonCode", "incidentReasonCode") = 0
    WHEN state IN ('ASSIGNED', 'PICKED_UP') THEN
      num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt") = 3
      AND num_nonnulls("receivedGrams", "rejectionReasonCode", "incidentReasonCode") = 0
    WHEN state = 'RECEIVED' THEN
      num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt") = 3
      AND "receivedGrams" = "declaredGrams"
      AND num_nonnulls("rejectionReasonCode", "incidentReasonCode") = 0
    WHEN state = 'REJECTED' THEN
      num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams", "incidentReasonCode") = 0
      AND length(btrim("rejectionReasonCode")) > 0
    WHEN state = 'INCIDENT' THEN
      num_nonnulls("assignedBuyerId", "assignedTripId", "assignedAt", "receivedGrams") = 4
      AND "rejectionReasonCode" IS NULL AND length(btrim("incidentReasonCode")) > 0
      AND ("incidentReasonCode" <> 'WEIGHT_MISMATCH' OR "receivedGrams" <> "declaredGrams")
    ELSE false
  END
) IS TRUE) NOT VALID;
COMMIT;
