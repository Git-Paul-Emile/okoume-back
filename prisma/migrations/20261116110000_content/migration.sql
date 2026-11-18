-- CreateEnum
CREATE TYPE "BannerAccent" AS ENUM ('forest', 'mure');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "home_banners" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "accent" "BannerAccent" NOT NULL DEFAULT 'forest',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" UUID NOT NULL,
    "placement" TEXT NOT NULL,
    "advertiser" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT NOT NULL,
    "image_mobile" TEXT,
    "alt" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exclusive_offers" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "href" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exclusive_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "reading_time" INTEGER NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_pages" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_pages_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "home_banners_active_position_idx" ON "home_banners"("active", "position");

-- CreateIndex
CREATE INDEX "ads_placement_active_idx" ON "ads"("placement", "active");

-- CreateIndex
CREATE INDEX "exclusive_offers_active_position_idx" ON "exclusive_offers"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at");

-- AddForeignKey
ALTER TABLE "exclusive_offers" ADD CONSTRAINT "exclusive_offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ajouts manuels
ALTER TABLE "ads" ADD CONSTRAINT "ads_placement" CHECK ("placement" IN ('home-promo', 'home-promo-side'));
ALTER TABLE "ads" ADD CONSTRAINT "ads_campaign_dates" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "articles" ADD CONSTRAINT "articles_reading_time" CHECK ("reading_time" BETWEEN 1 AND 120);
