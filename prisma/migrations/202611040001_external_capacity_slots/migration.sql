BEGIN;

-- Capacidad externa global (D15): el lease de admisión compartida reutiliza MaintenanceLease
-- con nombres EXTERNAL_CAPACITY_<índice>, además del lease diario DAILY_MAINTENANCE.
ALTER TABLE "MaintenanceLease" DROP CONSTRAINT "MaintenanceLease_name_check";
ALTER TABLE "MaintenanceLease" ADD CONSTRAINT "MaintenanceLease_name_check"
  CHECK ("name" = 'DAILY_MAINTENANCE' OR "name" ~ '^EXTERNAL_CAPACITY_[0-9]+$');

COMMIT;
