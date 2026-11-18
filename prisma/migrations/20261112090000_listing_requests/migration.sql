-- CreateEnum
CREATE TYPE "HandoverMode" AS ENUM ('pickup', 'seller_delivery');

-- CreateEnum
CREATE TYPE "ListingRequestStatus" AS ENUM ('sent', 'accepted', 'refused', 'cancelled', 'concluded', 'not_concluded');

-- CreateEnum
CREATE TYPE "RequestActor" AS ENUM ('buyer', 'seller');

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'sold';

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "accepted_payment_methods" "PaymentMethod"[] DEFAULT ARRAY['cash']::"PaymentMethod"[],
ADD COLUMN     "handover_modes" "HandoverMode"[] DEFAULT ARRAY['pickup']::"HandoverMode"[];

-- CreateTable
CREATE TABLE "listing_requests" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "listing_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "listing_title" TEXT NOT NULL,
    "quantity" INTEGER,
    "unit_price" DECIMAL(12,0) NOT NULL,
    "total" DECIMAL(12,0) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "handover" "HandoverMode" NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" "ListingRequestStatus" NOT NULL DEFAULT 'sent',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_request_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "status" "ListingRequestStatus" NOT NULL,
    "actor" "RequestActor" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_requests_number_key" ON "listing_requests"("number");

-- CreateIndex
CREATE INDEX "listing_requests_shop_id_status_created_at_idx" ON "listing_requests"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "listing_requests_buyer_id_created_at_idx" ON "listing_requests"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_requests_listing_id_idx" ON "listing_requests"("listing_id");

-- CreateIndex
CREATE INDEX "listing_request_events_request_id_created_at_idx" ON "listing_request_events"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_request_events" ADD CONSTRAINT "listing_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "listing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md), que le schéma Prisma ne sait pas décrire : à conserver.
-- La nouvelle valeur « sold » de ListingStatus n'est utilisée nulle part dans cette migration : PostgreSQL
-- interdit d'employer une valeur d'énumération dans la transaction qui l'ajoute.

-- Une boutique propose au moins un moyen de paiement et un mode de remise
ALTER TABLE "shops" ALTER COLUMN "accepted_payment_methods" SET NOT NULL;
ALTER TABLE "shops" ALTER COLUMN "handover_modes" SET NOT NULL;
ALTER TABLE "shops" ADD CONSTRAINT "shops_sale_terms_present" CHECK (
  CARDINALITY("accepted_payment_methods") >= 1 AND CARDINALITY("handover_modes") >= 1
);

-- Montants cohérents : le total est le prix unitaire fois la quantité (une unité pour un service)
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_amounts_valid" CHECK (
  ("quantity" IS NULL OR "quantity" > 0) AND "unit_price" > 0
  AND "total" = "unit_price" * COALESCE("quantity", 1)
);
-- Un refus et une vente non conclue portent toujours leur motif
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_reason_present" CHECK (
  "status" NOT IN ('refused', 'not_concluded') OR "reason" IS NOT NULL
);

-- Une seule demande ouverte (envoyée ou acceptée) par acheteur et par annonce
CREATE UNIQUE INDEX "listing_requests_one_open" ON "listing_requests" ("listing_id", "buyer_id")
  WHERE "status" IN ('sent', 'accepted');
