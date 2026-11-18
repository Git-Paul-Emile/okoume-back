-- Code de livraison offerte sans autre réduction : valeur 0 permise seulement dans ce cas
ALTER TABLE "promo_codes" DROP CONSTRAINT "promo_codes_value_valid";
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_value_valid" CHECK (
  ("value" > 0 OR ("value" = 0 AND "free_delivery"))
  AND ("type" <> 'percent' OR "value" <= 100) AND "min_amount" >= 0 AND "starts_at" < "ends_at"
);
