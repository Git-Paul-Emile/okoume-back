-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "product_reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "customer_id" UUID,
    "author_name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_reviews_product_id_status_created_at_idx" ON "product_reviews"("product_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "product_reviews_status_created_at_idx" ON "product_reviews"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_reviews_product_id_customer_id_key" ON "product_reviews"("product_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_reports_review_id_customer_id_key" ON "review_reports"("review_id", "customer_id");

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ajouts manuels
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_photos_max" CHECK (cardinality("photos") <= 3);
-- Un avis non publié porte toujours le motif communiqué à son auteur
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_rejection_reason" CHECK ("status" <> 'rejected' OR "rejection_reason" IS NOT NULL);
