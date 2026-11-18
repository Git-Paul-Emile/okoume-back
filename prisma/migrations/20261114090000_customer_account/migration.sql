-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "max_addresses" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zone_id" UUID NOT NULL,
    "landmark" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_favorites" (
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("customer_id","product_id")
);

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_created_at_idx" ON "customer_addresses"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_favorites_product_id_idx" ON "customer_favorites"("product_id");

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_favorites" ADD CONSTRAINT "customer_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ajouts manuels (non exprimables dans schema.prisma)

-- Une seule adresse par défaut par client
CREATE UNIQUE INDEX "customer_addresses_one_default" ON "customer_addresses"("customer_id") WHERE "is_default";

-- Plafond d'adresses réglable dans une plage raisonnable
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_max_addresses_check" CHECK ("max_addresses" BETWEEN 1 AND 20);
