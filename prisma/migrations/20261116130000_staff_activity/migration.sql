-- CreateTable
CREATE TABLE "staff_activities" (
    "id" UUID NOT NULL,
    "staff_id" UUID,
    "staff_name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "area" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_activities_created_at_idx" ON "staff_activities"("created_at");

-- CreateIndex
CREATE INDEX "staff_activities_staff_id_created_at_idx" ON "staff_activities"("staff_id", "created_at");

-- AddForeignKey
ALTER TABLE "staff_activities" ADD CONSTRAINT "staff_activities_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ajouts manuels
-- Journal en ajout seul : une ligne enregistrée ne se modifie jamais
CREATE FUNCTION staff_activities_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal d''activité ne se modifie pas';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER staff_activities_no_update BEFORE UPDATE ON "staff_activities"
  FOR EACH ROW EXECUTE FUNCTION staff_activities_append_only();
