-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('standard', 'welcome', 'birthday');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('pending', 'granted', 'rejected');

-- CreateEnum
CREATE TYPE "BirthdayChoice" AS ENUM ('points', 'code');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyMovementType" ADD VALUE 'referral';
ALTER TYPE "LoyaltyMovementType" ADD VALUE 'birthday';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "birthday_choice" "BirthdayChoice" NOT NULL DEFAULT 'points',
ADD COLUMN     "referral_code" TEXT NOT NULL,
ADD COLUMN     "referred_by_id" UUID;

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "kind" "PromoKind" NOT NULL DEFAULT 'standard';

-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "birthday_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "birthday_percent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "birthday_points" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "birthday_valid_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "referral_reward" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "welcome_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcome_percent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "welcome_valid_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "referral_rewards" (
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "status" "RewardStatus" NOT NULL,
    "signals" TEXT[],
    "decision_note" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_rewards" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "choice" "BirthdayChoice" NOT NULL,
    "promo_code_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "birthday_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_referee_id_key" ON "referral_rewards"("referee_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_rewards_order_id_key" ON "referral_rewards"("order_id");

-- CreateIndex
CREATE INDEX "referral_rewards_status_created_at_idx" ON "referral_rewards"("status", "created_at");

-- CreateIndex
CREATE INDEX "referral_rewards_referrer_id_created_at_idx" ON "referral_rewards"("referrer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_rewards_customer_id_year_key" ON "birthday_rewards"("customer_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "customers_referral_code_key" ON "customers"("referral_code");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_rewards" ADD CONSTRAINT "birthday_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md)
ALTER TABLE "customers" ADD CONSTRAINT "customers_not_own_referrer" CHECK ("referred_by_id" IS NULL OR "referred_by_id" <> "id");
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_valid" CHECK (
  "points" > 0 AND "referrer_id" <> "referee_id"
  AND (("status" = 'pending' AND "decided_at" IS NULL) OR "status" <> 'pending')
);
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_rewards_valid" CHECK (
  "referral_reward" >= 0 AND "welcome_percent" BETWEEN 1 AND 90 AND "welcome_valid_days" BETWEEN 1 AND 365
  AND "birthday_points" >= 0 AND "birthday_percent" BETWEEN 1 AND 90 AND "birthday_valid_days" BETWEEN 1 AND 365
);

-- Un seul code de bienvenue par client (index partiel, à conserver dans toute migration future)
CREATE UNIQUE INDEX "promo_codes_one_welcome" ON "promo_codes" ("customer_id") WHERE "kind" = 'welcome';
