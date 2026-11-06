BEGIN;

-- Sesión (D10, D18): revocación server-side y límite por inactividad de 60 min.
ALTER TABLE "DemoSession"
  ADD COLUMN "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revokedAt" TIMESTAMPTZ(3);

-- Backfill aditivo: sesiones existentes inicializan lastActivityAt con su createdAt.
UPDATE "DemoSession"
  SET "lastActivityAt" = "createdAt"
  WHERE "lastActivityAt" IS NOT NULL;

COMMIT;
