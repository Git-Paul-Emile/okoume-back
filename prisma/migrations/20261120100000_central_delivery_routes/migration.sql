-- Confirmation de collecte par boutique pour les tournées multi-boutiques.
ALTER TABLE "orders"
  ADD COLUMN "collection_confirmed_at" TIMESTAMPTZ,
  ADD COLUMN "collection_confirmed_by" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_collection_confirmation_pair"
  CHECK (("collection_confirmed_at" IS NULL) = ("collection_confirmed_by" IS NULL));
