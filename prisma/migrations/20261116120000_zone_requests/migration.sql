-- CreateEnum
CREATE TYPE "ZoneRequestStatus" AS ENUM ('new', 'added', 'declined');

-- CreateTable
CREATE TABLE "zone_requests" (
    "id" UUID NOT NULL,
    "neighbourhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "status" "ZoneRequestStatus" NOT NULL DEFAULT 'new',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zone_requests_status_created_at_idx" ON "zone_requests"("status", "created_at");


-- Ajouts manuels
-- Une demande traitée porte toujours la suite donnée (zone ouverte ou motif du refus)
ALTER TABLE "zone_requests" ADD CONSTRAINT "zone_requests_note" CHECK ("status" = 'new' OR "note" IS NOT NULL);
