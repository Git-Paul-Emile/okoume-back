-- The MVP has one back-office role. Normalize existing members before removing role storage.
UPDATE "staff_members" SET "role" = 'super_admin';

DROP TABLE "staff_custom_roles";
DROP TABLE "custom_roles";
ALTER TABLE "staff_members" DROP COLUMN "extra_roles";

-- Keep historical activity entries readable as text, while future entries use the single Admin label.
ALTER TABLE "staff_members"
  ALTER COLUMN "role" TYPE TEXT USING "role"::text;
ALTER TABLE "staff_members"
  ALTER COLUMN "role" SET DEFAULT 'super_admin';
ALTER TABLE "staff_activities"
  ALTER COLUMN "role" TYPE TEXT USING "role"::text;

DROP TYPE "StaffRole";
