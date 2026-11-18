-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('pending', 'refused', 'expected', 'received', 'refund_due', 'refunded', 'closed');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('none', 'pending', 'done');

-- CreateEnum
CREATE TYPE "ReturnShippingPayer" AS ENUM ('shop', 'customer');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'mise_au_rebut';

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "evidence_urls" TEXT[],
    "decision_reason" TEXT,
    "shipping_paid_by" "ReturnShippingPayer",
    "shipping_reason" TEXT,
    "inspection_note" TEXT,
    "refund_amount" DECIMAL(12,0),
    "refunded_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "restock_status" "RestockStatus" NOT NULL DEFAULT 'none',
    "reopen_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "resaleable" INTEGER,
    "unsellable" INTEGER,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_events" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "note" TEXT,
    "actor" "OrderActor" NOT NULL,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_write_offs" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference_value" DECIMAL(12,0) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_order_id_key" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_requests_status_created_at_idx" ON "return_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_id_variant_id_key" ON "return_items"("return_id", "variant_id");

-- CreateIndex
CREATE INDEX "return_events_return_id_created_at_idx" ON "return_events"("return_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_write_offs_variant_id_created_at_idx" ON "stock_write_offs"("variant_id", "created_at");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_write_offs" ADD CONSTRAINT "stock_write_offs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_write_offs" ADD CONSTRAINT "stock_write_offs_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_inspection_complete" CHECK (
  ("resaleable" IS NULL AND "unsellable" IS NULL)
  OR ("resaleable" >= 0 AND "unsellable" >= 0 AND "resaleable" + "unsellable" = "quantity")
);
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_refund_bounded" CHECK (
  "refunded_amount" >= 0 AND ("refund_amount" IS NULL OR ("refund_amount" >= 0 AND "refunded_amount" <= "refund_amount"))
);
ALTER TABLE "stock_write_offs" ADD CONSTRAINT "stock_write_offs_positive" CHECK ("quantity" > 0 AND "reference_value" >= 0);
