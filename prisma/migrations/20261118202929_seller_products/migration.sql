-- CreateEnum
CREATE TYPE "ProductModeration" AS ENUM ('in_review', 'changes_requested', 'pending_moderation', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "condition" "ListingCondition",
ADD COLUMN     "moderation" "ProductModeration",
ADD COLUMN     "moderation_issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "moderation_note" TEXT,
ADD COLUMN     "moderation_version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_moderation_idx" ON "products"("moderation");
