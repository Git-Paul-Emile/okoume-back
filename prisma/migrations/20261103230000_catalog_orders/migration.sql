-- CreateEnum
CREATE TYPE "ImageFit" AS ENUM ('cover', 'contain');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('reception', 'ajustement', 'commande', 'annulation', 'retour', 'non_vendable');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered', 'cancelled', 'claim');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('awaiting_payment', 'awaiting_verification', 'paid', 'refund_due', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'airtel', 'moov');

-- CreateEnum
CREATE TYPE "OrderActor" AS ENUM ('customer', 'staff', 'system');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT,
    "parent_id" UUID,
    "icon" TEXT,
    "image" TEXT,
    "image_fit" "ImageFit" NOT NULL DEFAULT 'contain',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_collection" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_members" (
    "collection_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "collection_members_pkey" PRIMARY KEY ("collection_id","category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "brand" TEXT,
    "short_description" TEXT NOT NULL,
    "description" TEXT[],
    "specs" JSONB NOT NULL DEFAULT '[]',
    "usage_tips" TEXT,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "hs_code" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "deal_of_the_day" BOOLEAN NOT NULL DEFAULT false,
    "is_new" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "promotion_type" "PromotionType",
    "promotion_value" DECIMAL(12,0),
    "promotion_starts_at" TIMESTAMP(3),
    "promotion_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price" DECIMAL(12,0) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "unsellable" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 3,
    "image" TEXT,
    "weight_grams" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "order_id" UUID,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "fee" DECIMAL(12,0) NOT NULL,
    "eta" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "courier_cost" DECIMAL(12,0),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "tracking_code" TEXT NOT NULL,
    "customer_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "zone_name" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,
    "subtotal" DECIMAL(12,0) NOT NULL,
    "product_discount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "code_discount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "points_discount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(12,0) NOT NULL,
    "delivery_discount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,0) NOT NULL,
    "promo_code" TEXT,
    "points_used" INTEGER NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "variant_label" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "unit_price" DECIMAL(12,0) NOT NULL,
    "original_price" DECIMAL(12,0) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "from_status" "OrderStatus",
    "note" TEXT,
    "actor" "OrderActor" NOT NULL,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_position_idx" ON "categories"("parent_id", "position");

-- CreateIndex
CREATE INDEX "collection_members_category_id_idx" ON "collection_members"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_status_category_id_idx" ON "products"("status", "category_id");

-- CreateIndex
CREATE INDEX "products_status_created_at_idx" ON "products"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_images_product_id_position_key" ON "product_images"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "variants_sku_key" ON "variants"("sku");

-- CreateIndex
CREATE INDEX "variants_product_id_position_idx" ON "variants"("product_id", "position");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_city_name_key" ON "delivery_zones"("city", "name");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_customer_id_created_at_idx" ON "orders"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_members" ADD CONSTRAINT "collection_members_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier garanties par la base (rules/10-stack/database.md), en plus de la validation de l'API
ALTER TABLE "variants" ADD CONSTRAINT "variants_price_positive" CHECK ("price" >= 0);
ALTER TABLE "variants" ADD CONSTRAINT "variants_stock_coherent"
  CHECK ("stock" >= 0 AND "reserved" >= 0 AND "unsellable" >= 0 AND "reserved" <= "stock");
ALTER TABLE "variants" ADD CONSTRAINT "variants_low_stock_threshold_positive" CHECK ("low_stock_threshold" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_range" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "products" ADD CONSTRAINT "products_promotion_complete" CHECK (
  ("promotion_type" IS NULL AND "promotion_value" IS NULL AND "promotion_starts_at" IS NULL AND "promotion_ends_at" IS NULL)
  OR ("promotion_type" IS NOT NULL AND "promotion_value" > 0 AND "promotion_starts_at" < "promotion_ends_at"
      AND ("promotion_type" <> 'percent' OR "promotion_value" <= 100))
);
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_position_positive" CHECK ("position" >= 0);
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_fee_positive" CHECK ("fee" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_positive" CHECK (
  "subtotal" >= 0 AND "product_discount" >= 0 AND "code_discount" >= 0 AND "points_discount" >= 0
  AND "delivery_fee" >= 0 AND "delivery_discount" >= 0 AND "total" >= 0 AND "points_used" >= 0
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_consistent" CHECK (
  "total" = "subtotal" - "code_discount" - "points_discount" + "delivery_fee" - "delivery_discount"
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_prices_positive"
  CHECK ("unit_price" >= 0 AND "original_price" >= "unit_price");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_delta_consistent" CHECK ("after" - "before" = "delta");
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
