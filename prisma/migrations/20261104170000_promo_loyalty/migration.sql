-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('bronze', 'argent', 'or');

-- CreateEnum
CREATE TYPE "LoyaltyMovementType" AS ENUM ('earn', 'redeem', 'restore', 'reversal', 'adjust');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "promo_code_id" UUID;

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" DECIMAL(12,0) NOT NULL,
    "min_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "free_delivery" BOOLEAN NOT NULL DEFAULT false,
    "new_customers_only" BOOLEAN NOT NULL DEFAULT false,
    "tiers" "LoyaltyTier"[],
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER,
    "per_customer" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_products" (
    "promo_code_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "promo_code_products_pkey" PRIMARY KEY ("promo_code_id","product_id")
);

-- CreateTable
CREATE TABLE "promo_code_categories" (
    "promo_code_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "promo_code_categories_pkey" PRIMARY KEY ("promo_code_id","category_id")
);

-- CreateTable
CREATE TABLE "loyalty_movements" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "type" "LoyaltyMovementType" NOT NULL,
    "label" TEXT NOT NULL,
    "order_id" UUID,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "max_discount_rate" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    "silver_threshold" DECIMAL(12,0) NOT NULL DEFAULT 300000,
    "gold_threshold" DECIMAL(12,0) NOT NULL DEFAULT 1000000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "loyalty_movements_customer_id_created_at_idx" ON "loyalty_movements"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_movements_order_id_idx" ON "loyalty_movements"("order_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_products" ADD CONSTRAINT "promo_code_products_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_products" ADD CONSTRAINT "promo_code_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_categories" ADD CONSTRAINT "promo_code_categories_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_categories" ADD CONSTRAINT "promo_code_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_value_valid" CHECK (
  "value" > 0 AND ("type" <> 'percent' OR "value" <= 100) AND "min_amount" >= 0 AND "starts_at" < "ends_at"
);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_limits_valid" CHECK (
  ("max_uses" IS NULL OR "max_uses" > 0) AND ("per_customer" IS NULL OR "per_customer" > 0) AND "uses" >= 0
  AND ("max_uses" IS NULL OR "uses" <= "max_uses")
);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_uppercase" CHECK ("code" = UPPER("code"));
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_points_non_zero" CHECK ("points" <> 0);
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_values_valid" CHECK (
  "max_discount_rate" > 0 AND "max_discount_rate" <= 1 AND "silver_threshold" > 0 AND "gold_threshold" > "silver_threshold"
);

-- Une commande ne crédite ses points qu'une fois, et n'utilise des points qu'une fois (12.5, 28.5).
-- Index partiels, que le schéma Prisma ne sait pas décrire : à conserver dans toute migration future.
CREATE UNIQUE INDEX "loyalty_movements_earn_once" ON "loyalty_movements" ("order_id") WHERE "type" = 'earn';
CREATE UNIQUE INDEX "loyalty_movements_redeem_once" ON "loyalty_movements" ("order_id") WHERE "type" = 'redeem';
CREATE UNIQUE INDEX "loyalty_movements_restore_once" ON "loyalty_movements" ("order_id") WHERE "type" = 'restore';

-- Réglages par défaut : la ligne unique existe dès l'installation
INSERT INTO "shop_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP);
