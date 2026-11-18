-- CreateTable
CREATE TABLE "listing_views" (
    "listing_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("listing_id","day")
);

-- CreateIndex
CREATE INDEX "listing_views_day_idx" ON "listing_views"("day");

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un compteur de visites est toujours positif ou nul
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_count_positive" CHECK ("count" >= 0);
