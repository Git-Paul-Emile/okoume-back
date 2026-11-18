-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('sending', 'sent', 'failed', 'retried');

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'sending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_deliveries_created_at_idx" ON "email_deliveries"("created_at");


-- Ajouts manuels
-- Un e-mail sensible (code, lien d'accès) n'a jamais de texte conservé
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_sensitive_text" CHECK (NOT "sensitive" OR "text" IS NULL);
-- Un e-mail parti n'a plus de texte conservé, et porte sa date d'envoi
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_sent" CHECK ("status" <> 'sent' OR ("text" IS NULL AND "sent_at" IS NOT NULL));
