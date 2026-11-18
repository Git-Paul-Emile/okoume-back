-- CreateEnum
CREATE TYPE "AccessPlanKind" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "ShopPaymentStatus" AS ENUM ('pending', 'validated', 'refused');

-- CreateTable
CREATE TABLE "access_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" "AccessPlanKind" NOT NULL,
    "price" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "period_days" INTEGER,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "latitude" DECIMAL(8,6),
    "longitude" DECIMAL(9,6),
    "phone" TEXT NOT NULL,
    "plan_id" UUID NOT NULL,
    "access_ends_at" TIMESTAMP(3),
    "in_trial" BOOLEAN NOT NULL DEFAULT false,
    "status" "ShopStatus" NOT NULL DEFAULT 'active',
    "suspension_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspended_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "reminder_sent_for" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_payments" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ShopPaymentStatus" NOT NULL DEFAULT 'pending',
    "decision_reason" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "grace_days" INTEGER NOT NULL DEFAULT 3,
    "reminder_days" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_plans_name_key" ON "access_plans"("name");

-- CreateIndex
CREATE INDEX "access_plans_active_position_idx" ON "access_plans"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_id_key" ON "shops"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_slug_key" ON "shops"("slug");

-- CreateIndex
CREATE INDEX "shops_status_access_ends_at_idx" ON "shops"("status", "access_ends_at");

-- CreateIndex
CREATE INDEX "shops_plan_id_idx" ON "shops"("plan_id");

-- CreateIndex
CREATE INDEX "shop_payments_status_created_at_idx" ON "shop_payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "shop_payments_shop_id_created_at_idx" ON "shop_payments"("shop_id", "created_at");

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "access_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_suspended_by_id_fkey" FOREIGN KEY ("suspended_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "access_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md), que le schéma Prisma ne sait pas décrire : à conserver.

-- Une offre gratuite n'a ni prix, ni période, ni essai ; une offre payante a un prix et une période
ALTER TABLE "access_plans" ADD CONSTRAINT "access_plans_terms_valid" CHECK (
  ("kind" = 'free' AND "price" = 0 AND "period_days" IS NULL AND "trial_days" = 0)
  OR ("kind" = 'paid' AND "price" > 0 AND "period_days" BETWEEN 1 AND 366 AND "trial_days" BETWEEN 0 AND 366)
);

-- Position complète ou absente, coordonnées dans leurs bornes ; une suspension porte toujours sa date et son motif
ALTER TABLE "shops" ADD CONSTRAINT "shops_position_valid" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "shops" ADD CONSTRAINT "shops_suspension_complete" CHECK (
  ("status" = 'active' AND "suspended_at" IS NULL AND "suspension_reason" IS NULL)
  OR ("status" = 'suspended' AND "suspended_at" IS NOT NULL AND "suspension_reason" IS NOT NULL)
);
ALTER TABLE "shops" ADD CONSTRAINT "shops_trial_has_end" CHECK (NOT "in_trial" OR "access_ends_at" IS NOT NULL);

-- Mobile Money seulement ; une décision porte sa date, une validation sa période, un refus son motif
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_mobile_money" CHECK ("method" IN ('airtel', 'moov'));
ALTER TABLE "shop_payments" ADD CONSTRAINT "shop_payments_decision_complete" CHECK (
  ("status" = 'pending' AND "decided_at" IS NULL AND "period_start" IS NULL AND "period_end" IS NULL)
  OR ("status" = 'validated' AND "decided_at" IS NOT NULL AND "period_end" > "period_start")
  OR ("status" = 'refused' AND "decided_at" IS NOT NULL AND "decision_reason" IS NOT NULL AND "period_start" IS NULL)
);

-- Un seul paiement en attente par boutique ; une même transaction ne sert qu'une fois (hors paiements refusés)
CREATE UNIQUE INDEX "shop_payments_one_pending" ON "shop_payments" ("shop_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "shop_payments_reference_unique" ON "shop_payments" ("method", "reference") WHERE "status" <> 'refused';

ALTER TABLE "marketplace_settings" ADD CONSTRAINT "marketplace_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "marketplace_settings" ADD CONSTRAINT "marketplace_settings_values_valid" CHECK (
  "grace_days" BETWEEN 0 AND 60 AND "reminder_days" BETWEEN 1 AND 60
);
INSERT INTO "marketplace_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP);
