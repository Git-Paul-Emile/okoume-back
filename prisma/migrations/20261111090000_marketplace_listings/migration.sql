-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('product', 'service');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('new', 'like_new', 'good', 'used');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'in_review', 'changes_requested', 'pending_moderation', 'published', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('ai', 'staff');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('approved', 'changes_requested', 'moderation', 'rejected');

-- CreateEnum
CREATE TYPE "ListingReportReason" AS ENUM ('prohibited', 'scam', 'misleading', 'offensive', 'personal_data', 'inappropriate_photos', 'spam', 'other');

-- CreateEnum
CREATE TYPE "ListingReportStatus" AS ENUM ('open', 'dismissed', 'upheld');

-- AlterTable
ALTER TABLE "marketplace_settings" ADD COLUMN     "ai_review_monthly_limit" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "condition" "ListingCondition",
    "price" DECIMAL(12,0) NOT NULL,
    "quantity" INTEGER,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "outcome" "ReviewOutcome" NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "model" TEXT,
    "staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reports" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "ListingReportReason" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "status" "ListingReportStatus" NOT NULL DEFAULT 'open',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "listings"("slug");

-- CreateIndex
CREATE INDEX "listings_shop_id_status_idx" ON "listings"("shop_id", "status");

-- CreateIndex
CREATE INDEX "listings_status_category_id_published_at_idx" ON "listings"("status", "category_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "listing_photos_listing_id_position_key" ON "listing_photos"("listing_id", "position");

-- CreateIndex
CREATE INDEX "listing_reviews_listing_id_created_at_idx" ON "listing_reviews"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_reviews_source_created_at_idx" ON "listing_reviews"("source", "created_at");

-- CreateIndex
CREATE INDEX "listing_reports_status_created_at_idx" ON "listing_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "listing_reports_listing_id_idx" ON "listing_reports"("listing_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (rules/10-stack/database.md), que le schéma Prisma ne sait pas décrire : à conserver.

-- Un produit a un état et une quantité ; un service n'en a pas. Prix et version positifs.
ALTER TABLE "listings" ADD CONSTRAINT "listings_kind_fields" CHECK (
  ("kind" = 'product' AND "condition" IS NOT NULL AND "quantity" IS NOT NULL AND "quantity" >= 0)
  OR ("kind" = 'service' AND "condition" IS NULL AND "quantity" IS NULL)
);
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_positive" CHECK ("price" > 0);
ALTER TABLE "listings" ADD CONSTRAINT "listings_version_positive" CHECK ("version" >= 0);
-- Une annonce publiée porte sa date de publication ; une annonce soumise sa date de soumission
ALTER TABLE "listings" ADD CONSTRAINT "listings_dates_consistent" CHECK (
  ("status" <> 'published' OR "published_at" IS NOT NULL)
  AND ("status" = 'draft' OR "submitted_at" IS NOT NULL)
);
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_position_range" CHECK ("position" BETWEEN 0 AND 7);

-- Une revue humaine porte son auteur ; un refus ou une demande de correction humaine porte son motif
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_staff_complete" CHECK (
  ("source" = 'ai' AND "staff_id" IS NULL AND "outcome" <> 'rejected')
  OR ("source" = 'staff' AND ("outcome" = 'approved' OR "reason" IS NOT NULL))
);

-- Un signalement ouvert par client et par annonce ; une décision porte sa date
CREATE UNIQUE INDEX "listing_reports_one_open" ON "listing_reports" ("listing_id", "reporter_id") WHERE "status" = 'open';
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_decision_complete" CHECK (
  ("status" = 'open' AND "decided_at" IS NULL) OR ("status" <> 'open' AND "decided_at" IS NOT NULL)
);

ALTER TABLE "marketplace_settings" ADD CONSTRAINT "marketplace_settings_ai_limit_valid" CHECK ("ai_review_monthly_limit" >= 0);
