-- Produits des vendeurs (32.3) : règles portées par la base.

-- La vérification ne concerne que les produits d'une boutique de vendeur
ALTER TABLE "products" ADD CONSTRAINT "products_moderation_only_for_shops"
  CHECK ("moderation" IS NULL OR "shop_id" IS NOT NULL);

-- Un produit de vendeur n'est en vente qu'après vérification favorable
ALTER TABLE "products" ADD CONSTRAINT "products_shop_published_approved"
  CHECK ("shop_id" IS NULL OR "status" <> 'published' OR "moderation" = 'approved');
