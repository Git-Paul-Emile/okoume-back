-- Recherche des annonces (cahier des charges, 32.4). Index décrits à la main : la recherche est en SQL paramétré
-- (listings.repository.ts) et Prisma ne décrit pas les index partiels.

-- Annonces publiées, les plus récentes d'abord : le classement par défaut sans position
CREATE INDEX "listings_published_recent" ON "listings" ("published_at" DESC) WHERE "status" = 'published';

-- Préfiltre par rectangle autour de l'acheteur avant le calcul exact de la distance
CREATE INDEX "shops_position" ON "shops" ("latitude", "longitude") WHERE "latitude" IS NOT NULL;
