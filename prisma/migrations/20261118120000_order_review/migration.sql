-- Commandes suspectes (19.3) : signaux calculés à la création, vérification humaine avant la préparation.
-- Migration additive : colonnes facultatives ou avec valeur par défaut, compatible avec la version précédente.

-- CreateEnum
CREATE TYPE "OrderReviewStatus" AS ENUM ('pending', 'cleared');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "phone_key" TEXT,
ADD COLUMN "review_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "review_status" "OrderReviewStatus",
ADD COLUMN "review_note" TEXT,
ADD COLUMN "reviewed_by" TEXT,
ADD COLUMN "reviewed_at" TIMESTAMP(3);

-- Commandes existantes : même clé de téléphone que l'application (8 derniers chiffres)
UPDATE "orders" SET "phone_key" = RIGHT(REGEXP_REPLACE("phone", '\D', '', 'g'), 8);

-- CreateIndex
CREATE INDEX "orders_phone_key_created_at_idx" ON "orders"("phone_key", "created_at");

-- CreateIndex
CREATE INDEX "orders_review_status_idx" ON "orders"("review_status");
