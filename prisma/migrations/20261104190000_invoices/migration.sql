-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('invoice', 'credit_note');

-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "delivery_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 18;

-- CreateTable
CREATE TABLE "document_sequences" (
    "type" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("type","year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "order_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" UUID,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "lines" JSONB NOT NULL,
    "vat_breakdown" JSONB NOT NULL,
    "total_ht" DECIMAL(12,0) NOT NULL,
    "total_vat" DECIMAL(12,0) NOT NULL,
    "total_ttc" DECIMAL(12,0) NOT NULL,
    "related_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_order_id_issued_at_idx" ON "invoices"("order_id", "issued_at");

-- CreateIndex
CREATE INDEX "invoices_type_issued_at_idx" ON "invoices"("type", "issued_at");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_related_id_fkey" FOREIGN KEY ("related_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_totals_consistent" CHECK (
  "total_ht" >= 0 AND "total_vat" >= 0 AND "total_ttc" = "total_ht" + "total_vat"
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_note_linked" CHECK (
  ("type" = 'invoice' AND "related_id" IS NULL) OR ("type" = 'credit_note' AND "related_id" IS NOT NULL AND "reason" IS NOT NULL)
);
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_positive" CHECK ("last" >= 0 AND "year" >= 2000);
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_delivery_vat_range" CHECK ("delivery_vat_rate" >= 0 AND "delivery_vat_rate" <= 100);

-- Une facture par commande au plus (index partiel, à conserver dans toute migration future)
CREATE UNIQUE INDEX "invoices_one_per_order" ON "invoices" ("order_id") WHERE "type" = 'invoice';

-- Document émis : ni modification ni suppression (25.4). Toute correction passe par un avoir.
CREATE FUNCTION "invoices_forbid_changes"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Une facture ou un avoir émis ne peut être ni modifié ni supprimé (%).', OLD."number";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoices_immutable" BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "invoices_forbid_changes"();
