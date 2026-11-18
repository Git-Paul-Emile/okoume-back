-- Paiement Mobile Money déclaré par le client : référence de la transaction et date de la déclaration.
-- Migration additive (colonnes facultatives) : compatible avec la version précédente du code.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_reference" TEXT,
ADD COLUMN "payment_declared_at" TIMESTAMP(3);
