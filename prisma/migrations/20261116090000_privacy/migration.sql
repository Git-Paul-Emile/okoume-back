-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('access', 'export', 'correction', 'deletion');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('received', 'in_progress', 'completed', 'refused');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "anonymized_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'received',
    "response" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "privacy_requests_number_key" ON "privacy_requests"("number");

-- CreateIndex
CREATE INDEX "privacy_requests_status_due_at_idx" ON "privacy_requests"("status", "due_at");

-- CreateIndex
CREATE INDEX "privacy_requests_customer_id_created_at_idx" ON "privacy_requests"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ajouts manuels
-- Une demande traitée ou refusée porte toujours la réponse communiquée au client
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_response" CHECK ("status" NOT IN ('completed', 'refused') OR "response" IS NOT NULL);
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_due_after_creation" CHECK ("due_at" >= "created_at");
-- Un compte anonymisé l'est toujours avec sa date, et seulement lui
ALTER TABLE "customers" ADD CONSTRAINT "customers_anonymized_at" CHECK (("status" = 'anonymized') = ("anonymized_at" IS NOT NULL));
