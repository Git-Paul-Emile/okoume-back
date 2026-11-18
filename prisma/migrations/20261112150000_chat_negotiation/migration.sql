-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "ChatAuthor" AS ENUM ('buyer', 'assistant', 'seller', 'system');

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "agreement_validity_hours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "ai_chat_monthly_limit" INTEGER NOT NULL DEFAULT 5000;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "min_price" DECIMAL(12,0),
ADD COLUMN     "seller_notes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "needs_seller" BOOLEAN NOT NULL DEFAULT false,
    "agreed_price" DECIMAL(12,0),
    "agreement_expires_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author" "ChatAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "reply_to_id" UUID,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_shop_id_needs_seller_last_message_at_idx" ON "conversations"("shop_id", "needs_seller", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_buyer_id_last_message_at_idx" ON "conversations"("buyer_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_listing_id_buyer_id_key" ON "conversations"("listing_id", "buyer_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_reply_to_id_key" ON "chat_messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md), que le schéma Prisma ne sait pas décrire : à conserver.

-- Le prix minimum de négociation est positif et ne dépasse pas le prix affiché
ALTER TABLE "listings" ADD CONSTRAINT "listings_min_price_valid" CHECK (
  "min_price" IS NULL OR ("min_price" > 0 AND "min_price" <= "price")
);
-- Un prix convenu porte toujours sa date d'expiration
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agreement_complete" CHECK (
  ("agreed_price" IS NULL) = ("agreement_expires_at" IS NULL) AND ("agreed_price" IS NULL OR "agreed_price" > 0)
);
-- Seul l'assistant répond à un message précis ; un message n'est jamais vide
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_by_assistant" CHECK (
  "reply_to_id" IS NULL OR "author" IN ('assistant', 'system')
);
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_present" CHECK (LENGTH("body") > 0);
ALTER TABLE "marketplace_settings" ADD CONSTRAINT "marketplace_settings_chat_valid" CHECK (
  "agreement_validity_hours" BETWEEN 1 AND 720 AND "ai_chat_monthly_limit" >= 0
);
