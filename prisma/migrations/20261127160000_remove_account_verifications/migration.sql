-- The MVP now activates customer accounts immediately and no longer uses account verification codes.
UPDATE "customers" SET "status" = 'active' WHERE "status" = 'pending_verification';

ALTER TABLE "customers" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "CustomerStatus_new" AS ENUM ('active', 'anonymized');
ALTER TABLE "customers"
  ALTER COLUMN "status" TYPE "CustomerStatus_new"
  USING ("status"::text::"CustomerStatus_new");
ALTER TABLE "customers" ALTER COLUMN "status" SET DEFAULT 'active';
DROP TYPE "CustomerStatus";
ALTER TYPE "CustomerStatus_new" RENAME TO "CustomerStatus";

ALTER TABLE "customers" DROP COLUMN "email_verified_at";
DROP TABLE "verification_codes";
DROP TYPE "VerificationPurpose";
DROP TABLE "backup_codes";
