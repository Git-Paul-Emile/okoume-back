-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('payment', 'refund');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "no_reference_reason" TEXT,
    "client_agreed" BOOLEAN NOT NULL DEFAULT false,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_order_id_created_at_idx" ON "payments"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_traceable"
  CHECK ("kind" = 'payment' OR "reference" IS NOT NULL OR "no_reference_reason" IS NOT NULL);

-- Double paiement (8.4) : une référence de transaction ne sert qu'à un seul encaissement, quelle que soit la casse.
-- Index partiel sur expression, que le schéma Prisma ne sait pas décrire : à conserver dans toute migration future.
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" (LOWER("reference"))
  WHERE "kind" = 'payment' AND "reference" IS NOT NULL;
