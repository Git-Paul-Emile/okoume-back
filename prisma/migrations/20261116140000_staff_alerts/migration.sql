-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('new', 'in_progress', 'resolved', 'closed');

-- CreateTable
CREATE TABLE "staff_alerts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "state" "AlertState" NOT NULL DEFAULT 'new',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "assignee_id" UUID,
    "closure_reason" TEXT,
    "action_taken" TEXT,
    "episodes" JSONB NOT NULL DEFAULT '[]',
    "last_reminder_at" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_alerts_key_key" ON "staff_alerts"("key");

-- CreateIndex
CREATE INDEX "staff_alerts_state_last_seen_at_idx" ON "staff_alerts"("state", "last_seen_at");

-- AddForeignKey
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ajouts manuels
-- Une alerte résolue ou clôturée porte toujours sa justification
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_closure_reason" CHECK ("state" NOT IN ('resolved', 'closed') OR "closure_reason" IS NOT NULL);
ALTER TABLE "staff_alerts" ADD CONSTRAINT "staff_alerts_occurrences" CHECK ("occurrences" >= 1);
