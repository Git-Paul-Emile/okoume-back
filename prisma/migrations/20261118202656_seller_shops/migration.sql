-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('okoume', 'seller');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "checkout_number" TEXT,
ADD COLUMN     "fulfilled_by" "Fulfillment" NOT NULL DEFAULT 'okoume',
ADD COLUMN     "shop_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "shop_id" UUID;

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "delivery_mode" "Fulfillment" NOT NULL DEFAULT 'okoume';

-- CreateTable
CREATE TABLE "shop_zone_fees" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "fee" DECIMAL(12,0) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_zone_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_payouts" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "collected" DECIMAL(12,0) NOT NULL,
    "delivery_fee" DECIMAL(12,0) NOT NULL,
    "commission_rate" DECIMAL(5,2) NOT NULL,
    "commission" DECIMAL(12,0) NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "method" "PaymentMethod",
    "reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "paid_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_zone_fees_zone_id_idx" ON "shop_zone_fees"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_zone_fees_shop_id_zone_id_key" ON "shop_zone_fees"("shop_id", "zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_payouts_order_id_key" ON "seller_payouts"("order_id");

-- CreateIndex
CREATE INDEX "seller_payouts_shop_id_status_created_at_idx" ON "seller_payouts"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "seller_payouts_status_created_at_idx" ON "seller_payouts"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_shop_id_status_created_at_idx" ON "orders"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_checkout_number_idx" ON "orders"("checkout_number");

-- CreateIndex
CREATE INDEX "products_shop_id_status_idx" ON "products"("shop_id", "status");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_zone_fees" ADD CONSTRAINT "shop_zone_fees_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_zone_fees" ADD CONSTRAINT "shop_zone_fees_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
