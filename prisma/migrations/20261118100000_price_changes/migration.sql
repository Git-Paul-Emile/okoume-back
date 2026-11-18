-- Historique des prix (4.3) : chaque changement de prix de vente d'une variante, avec motif et auteur.
-- Migration additive : compatible avec la version précédente du code.

-- CreateTable
CREATE TABLE "price_changes" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_changes_variant_id_created_at_idx" ON "price_changes"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "price_changes_created_at_idx" ON "price_changes"("created_at");

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
