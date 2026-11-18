-- CreateEnum
CREATE TYPE "CourierVehicle" AS ENUM ('moto', 'voiture', 'velo', 'a_pied');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "courier_id" UUID,
ADD COLUMN     "delivery_cost" DECIMAL(12,0);

-- CreateTable
CREATE TABLE "couriers" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "vehicle" "CourierVehicle" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courier_zones" (
    "courier_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,

    CONSTRAINT "courier_zones_pkey" PRIMARY KEY ("courier_id","zone_id")
);

-- CreateTable
CREATE TABLE "delivery_fee_changes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_fee" DECIMAL(12,0) NOT NULL,
    "to_fee" DECIMAL(12,0) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "delivery_fee_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_disputes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "delivery_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "courier_zones_zone_id_idx" ON "courier_zones"("zone_id");

-- CreateIndex
CREATE INDEX "delivery_fee_changes_order_id_created_at_idx" ON "delivery_fee_changes"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "delivery_disputes_status_created_at_idx" ON "delivery_disputes"("status", "created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_zones" ADD CONSTRAINT "courier_zones_courier_id_fkey" FOREIGN KEY ("courier_id") REFERENCES "couriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courier_zones" ADD CONSTRAINT "courier_zones_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_fee_changes" ADD CONSTRAINT "delivery_fee_changes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_cost_positive" CHECK ("delivery_cost" IS NULL OR "delivery_cost" >= 0);
ALTER TABLE "delivery_fee_changes" ADD CONSTRAINT "delivery_fee_changes_amounts" CHECK (
  "from_fee" >= 0 AND "to_fee" >= 0 AND "from_fee" <> "to_fee"
);
ALTER TABLE "delivery_fee_changes" ADD CONSTRAINT "delivery_fee_changes_decision" CHECK (
  ("status" = 'pending' AND "decided_at" IS NULL) OR ("status" <> 'pending' AND "decided_at" IS NOT NULL)
);
ALTER TABLE "delivery_disputes" ADD CONSTRAINT "delivery_disputes_resolution" CHECK (
  ("status" = 'open' AND "resolved_at" IS NULL) OR ("status" = 'resolved' AND "resolved_at" IS NOT NULL AND "resolution" IS NOT NULL)
);

-- Une seule demande de changement de frais en attente, une seule contestation ouverte par commande
-- (index partiels, à conserver dans toute migration future)
CREATE UNIQUE INDEX "delivery_fee_changes_one_pending" ON "delivery_fee_changes" ("order_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "delivery_disputes_one_open" ON "delivery_disputes" ("order_id") WHERE "status" = 'open';
