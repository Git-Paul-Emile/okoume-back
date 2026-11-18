-- CreateEnum
CREATE TYPE "AnalyticsEventKind" AS ENUM ('visit', 'product_view', 'product_click', 'search', 'add_to_cart', 'checkout');

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "kind" "AnalyticsEventKind" NOT NULL,
    "product_id" UUID,
    "term" TEXT,
    "results" INTEGER,
    "pwa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_usage" (
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("period")
);

-- CreateIndex
CREATE INDEX "analytics_events_kind_created_at_idx" ON "analytics_events"("kind", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");


-- Ajouts manuels
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_search" CHECK (("kind" = 'search') = ("term" IS NOT NULL));
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_results" CHECK ("results" IS NULL OR "results" >= 0);
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_period" CHECK ("period" ~ '^\d{4}-\d{2}$' AND "count" >= 0);
