BEGIN;

-- Retire les tables de fonctions supprimées, et les données qu'elles contiennent.
DROP TABLE IF EXISTS
  "listing_request_events", "chat_messages", "return_events", "review_reports",
  "staff_custom_roles", "staff_alerts", "assistant_questions", "assistant_usage",
  "assistant_actions", "assistant_decisions", "assistant_rules_versions", "analytics_events",
  "listing_boosts", "listing_views", "conversations", "listing_requests", "listing_reports",
  "listing_reviews", "listing_photos", "boost_plans", "listings", "support_messages",
  "support_tickets", "privacy_requests", "zone_requests", "staff_activities",
  "delivery_fee_changes", "delivery_disputes", "referral_rewards", "birthday_rewards",
  "loyalty_movements", "customer_favorites", "push_deliveries", "push_subscriptions",
  "return_items", "return_requests", "stock_write_offs", "cancellation_requests",
  "invoices", "document_sequences", "articles", "shop_payments",
  "access_plans", "marketplace_settings", "custom_roles"
CASCADE;

-- Annulations, litiges et remboursements n'existent plus dans le parcours MVP.
DELETE FROM "legal_pages" WHERE "slug" = 'retours';

DELETE FROM "order_events"
WHERE "status"::text IN ('cancelled', 'claim')
   OR "from_status"::text IN ('cancelled', 'claim');

DELETE FROM "stock_movements"
WHERE "type"::text IN ('annulation', 'retour', 'non_vendable', 'mise_au_rebut');

DELETE FROM "seller_payouts"
WHERE "order_id" IN (
  SELECT "id" FROM "orders"
  WHERE "status"::text IN ('cancelled', 'claim')
     OR "payment_status"::text IN ('refund_due', 'refunded')
);

DELETE FROM "payments"
WHERE "kind"::text = 'refund'
   OR "order_id" IN (
     SELECT "id" FROM "orders"
     WHERE "status"::text IN ('cancelled', 'claim')
        OR "payment_status"::text IN ('refund_due', 'refunded')
   );

DELETE FROM "orders"
WHERE "status"::text IN ('cancelled', 'claim')
   OR "payment_status"::text IN ('refund_due', 'refunded');

-- L'ancien statut de déclaration client correspond au paiement encore attendu.
UPDATE "orders"
SET "payment_status" = 'awaiting_payment'
WHERE "payment_status"::text = 'awaiting_verification';

-- Les compteurs des codes restent cohérents après suppression des anciennes commandes.
UPDATE "promo_codes" AS promo
SET "uses" = (
  SELECT COUNT(*)::integer FROM "orders" AS purchase WHERE purchase."promo_code_id" = promo."id"
);

-- Supprime les contraintes et index qui dépendent des champs retirés.
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_amounts_positive";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_total_consistent";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_seller_fulfillment_has_shop";
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_payment_declared_complete";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_refund_traceable";
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive";
ALTER TABLE "promo_codes" DROP CONSTRAINT IF EXISTS "promo_codes_limits_valid";
ALTER TABLE "promo_codes" DROP CONSTRAINT IF EXISTS "promo_codes_customer_id_fkey";
ALTER TABLE "shops" DROP CONSTRAINT IF EXISTS "shops_trial_has_end";
ALTER TABLE "shops" DROP CONSTRAINT IF EXISTS "shops_sale_terms_present";
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_anonymized_at";
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_not_own_referrer";
ALTER TABLE "staff_members" DROP CONSTRAINT IF EXISTS "staff_members_refund_limit_positive";
ALTER TABLE "shop_settings" DROP CONSTRAINT IF EXISTS "shop_settings_values_valid";
ALTER TABLE "shop_settings" DROP CONSTRAINT IF EXISTS "shop_settings_rewards_valid";
DROP INDEX IF EXISTS "orders_phone_key_created_at_idx";
DROP INDEX IF EXISTS "orders_review_status_idx";
DROP INDEX IF EXISTS "payments_reference_unique";
DROP INDEX IF EXISTS "promo_codes_one_welcome";
DROP INDEX IF EXISTS "shops_status_access_ends_at_idx";
DROP INDEX IF EXISTS "shops_plan_id_idx";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "points_discount",
  DROP COLUMN IF EXISTS "points_used",
  DROP COLUMN IF EXISTS "payment_reference",
  DROP COLUMN IF EXISTS "payment_declared_at",
  DROP COLUMN IF EXISTS "phone_key",
  DROP COLUMN IF EXISTS "review_reasons",
  DROP COLUMN IF EXISTS "review_status",
  DROP COLUMN IF EXISTS "review_note",
  DROP COLUMN IF EXISTS "reviewed_by",
  DROP COLUMN IF EXISTS "reviewed_at";

ALTER TABLE "payments"
  DROP COLUMN IF EXISTS "no_reference_reason",
  DROP COLUMN IF EXISTS "client_agreed";

ALTER TABLE "promo_codes"
  DROP COLUMN IF EXISTS "new_customers_only",
  DROP COLUMN IF EXISTS "tiers",
  DROP COLUMN IF EXISTS "per_customer",
  DROP COLUMN IF EXISTS "customer_id",
  DROP COLUMN IF EXISTS "kind";

ALTER TABLE "customers"
  DROP COLUMN IF EXISTS "birth_date",
  DROP COLUMN IF EXISTS "birthday_choice",
  DROP COLUMN IF EXISTS "referral_code",
  DROP COLUMN IF EXISTS "referred_by_id",
  DROP COLUMN IF EXISTS "anonymized_at";

ALTER TABLE "staff_members" DROP COLUMN IF EXISTS "refund_limit";

ALTER TABLE "shops"
  DROP COLUMN IF EXISTS "plan_id",
  DROP COLUMN IF EXISTS "access_ends_at",
  DROP COLUMN IF EXISTS "in_trial",
  DROP COLUMN IF EXISTS "reminder_sent_for",
  DROP COLUMN IF EXISTS "handover_modes";

ALTER TABLE "shop_settings"
  DROP COLUMN IF EXISTS "max_discount_rate",
  DROP COLUMN IF EXISTS "silver_threshold",
  DROP COLUMN IF EXISTS "gold_threshold",
  DROP COLUMN IF EXISTS "birthday_enabled",
  DROP COLUMN IF EXISTS "birthday_percent",
  DROP COLUMN IF EXISTS "birthday_points",
  DROP COLUMN IF EXISTS "birthday_valid_days",
  DROP COLUMN IF EXISTS "referral_reward",
  DROP COLUMN IF EXISTS "welcome_enabled",
  DROP COLUMN IF EXISTS "welcome_percent",
  DROP COLUMN IF EXISTS "welcome_valid_days";

ALTER TABLE "ads" DROP CONSTRAINT IF EXISTS "ads_placement";
ALTER TABLE "ads" ADD CONSTRAINT "ads_placement" CHECK ("placement" IN ('home-promo', 'home-promo-side'));

-- Ramène les énumérations des commandes et du stock aux états encore proposés dans l'application.
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE text USING "payment_status"::text;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE "order_events" ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE "order_events" ALTER COLUMN "from_status" TYPE text USING "from_status"::text;
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
CREATE TYPE "PaymentStatus" AS ENUM ('awaiting_payment', 'paid');
ALTER TABLE "orders" ALTER COLUMN "payment_status" TYPE "PaymentStatus" USING "payment_status"::"PaymentStatus";
DROP TYPE "PaymentStatus_old";
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('confirmed', 'preparing', 'ready', 'courier_assigned', 'shipping', 'delivered');
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus";
ALTER TABLE "order_events" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus";
ALTER TABLE "order_events" ALTER COLUMN "from_status" TYPE "OrderStatus" USING "from_status"::"OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'confirmed';

ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE text USING "type"::text;
ALTER TYPE "StockMovementType" RENAME TO "StockMovementType_old";
CREATE TYPE "StockMovementType" AS ENUM ('reception', 'ajustement', 'commande');
ALTER TABLE "stock_movements" ALTER COLUMN "type" TYPE "StockMovementType" USING "type"::"StockMovementType";
DROP TYPE "StockMovementType_old";

ALTER TABLE "payments" ALTER COLUMN "kind" TYPE text USING "kind"::text;
ALTER TYPE "PaymentKind" RENAME TO "PaymentKind_old";
CREATE TYPE "PaymentKind" AS ENUM ('payment');
ALTER TABLE "payments" ALTER COLUMN "kind" TYPE "PaymentKind" USING "kind"::"PaymentKind";
DROP TYPE "PaymentKind_old";

-- Les commandes historiques gardent leur total, y compris les remises fidélité retirées du modèle.
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_positive" CHECK (
  "subtotal" >= 0 AND "product_discount" >= 0 AND "code_discount" >= 0
  AND "delivery_fee" >= 0 AND "delivery_discount" >= 0 AND "total" >= 0
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_limits_valid" CHECK (
  ("max_uses" IS NULL OR "max_uses" > 0) AND "uses" >= 0
  AND ("max_uses" IS NULL OR "uses" <= "max_uses")
);
ALTER TABLE "shops" ADD CONSTRAINT "shops_sale_terms_present"
  CHECK (CARDINALITY("accepted_payment_methods") >= 1);

CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" (LOWER("reference"))
WHERE "kind" = 'payment' AND "reference" IS NOT NULL;

-- Retire les types qui n'ont plus aucune table ou colonne dans le modèle MVP.
DROP TYPE IF EXISTS
  "StaffRole", "RequestStatus", "ReturnStatus", "RestockStatus", "ReturnShippingPayer",
  "LoyaltyTier", "LoyaltyMovementType", "DocumentType", "DisputeStatus", "PromoKind",
  "RewardStatus", "BirthdayChoice", "AccessPlanKind", "ShopPaymentStatus", "ListingKind",
  "ReviewSource", "ReviewOutcome", "ListingReportReason", "ListingReportStatus", "HandoverMode",
  "ListingRequestStatus", "RequestActor", "ConversationStatus", "ChatAuthor", "TicketCategory",
  "TicketStatus", "TicketPriority", "TicketAuthor", "PrivacyRequestType", "PrivacyRequestStatus",
  "ArticleStatus", "ZoneRequestStatus", "AlertLevel", "AlertState",
  "AssistantDecisionKind", "AnalyticsEventKind", "OrderReviewStatus", "ListingStatus";

COMMIT;
