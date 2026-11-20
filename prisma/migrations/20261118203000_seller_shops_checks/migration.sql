-- Complète 20261118202656_seller_shops, migration additive (colonnes facultatives ou avec valeur par défaut, nouvelles tables).
-- Règles métier des boutiques vendeurs portées par la base (rules/10-stack/database.md).

-- Commission en pourcentage, entre 0 et 100
ALTER TABLE "marketplace_settings" ADD CONSTRAINT "marketplace_settings_commission_rate_range"
  CHECK ("commission_rate" >= 0 AND "commission_rate" <= 100);

-- Frais propres à un vendeur : jamais négatifs
ALTER TABLE "shop_zone_fees" ADD CONSTRAINT "shop_zone_fees_fee_positive" CHECK ("fee" >= 0);

-- Une commande livrée par le vendeur appartient forcément à une boutique de vendeur
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_fulfillment_has_shop"
  CHECK ("fulfilled_by" = 'okoume' OR "shop_id" IS NOT NULL);

-- Reversement : montants cohérents (reversé = encaissé - livraison - commission), jamais négatifs
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_amounts"
  CHECK (
    "collected" >= 0 AND "delivery_fee" >= 0 AND "commission" >= 0 AND "amount" >= 0
    AND "commission_rate" >= 0 AND "commission_rate" <= 100
    AND "amount" = "collected" - "delivery_fee" - "commission"
  );

-- Un reversement payé porte sa date ; un reversement non payé n'en a pas
ALTER TABLE "seller_payouts" ADD CONSTRAINT "seller_payouts_paid_complete"
  CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));
