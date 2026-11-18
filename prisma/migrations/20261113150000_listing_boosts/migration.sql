-- CreateTable
CREATE TABLE "boost_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "duration_days" INTEGER NOT NULL,
    "price" DECIMAL(12,0) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boost_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_boosts" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "ShopPaymentStatus" NOT NULL DEFAULT 'pending',
    "decision_reason" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boost_plans_name_key" ON "boost_plans"("name");

-- CreateIndex
CREATE INDEX "boost_plans_active_position_idx" ON "boost_plans"("active", "position");

-- CreateIndex
CREATE INDEX "listing_boosts_status_created_at_idx" ON "listing_boosts"("status", "created_at");

-- CreateIndex
CREATE INDEX "listing_boosts_shop_id_created_at_idx" ON "listing_boosts"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_boosts_listing_id_status_ends_at_idx" ON "listing_boosts"("listing_id", "status", "ends_at");

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "boost_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md), que le schéma Prisma ne sait pas décrire : à conserver.

ALTER TABLE "boost_plans" ADD CONSTRAINT "boost_plans_terms_valid" CHECK (
  "price" > 0 AND "duration_days" BETWEEN 1 AND 90
);

-- Mobile Money seulement ; une décision porte sa date, une validation sa période, un refus son motif
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_mobile_money" CHECK ("method" IN ('airtel', 'moov'));
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_decision_complete" CHECK (
  ("status" = 'pending' AND "decided_at" IS NULL AND "starts_at" IS NULL AND "ends_at" IS NULL)
  OR ("status" = 'validated' AND "decided_at" IS NOT NULL AND "ends_at" > "starts_at")
  OR ("status" = 'refused' AND "decided_at" IS NOT NULL AND "decision_reason" IS NOT NULL AND "starts_at" IS NULL)
);

-- Une seule mise en avant en attente par annonce ; une même transaction ne sert qu'une fois (hors refus)
CREATE UNIQUE INDEX "listing_boosts_one_pending" ON "listing_boosts" ("listing_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "listing_boosts_reference_unique" ON "listing_boosts" ("method", "reference") WHERE "status" <> 'refused';
