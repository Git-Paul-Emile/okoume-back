-- CreateTable
CREATE TABLE "shop_information" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mobile_money" JSONB NOT NULL DEFAULT '[]',
    "mobile_money_expiry_hours" INTEGER NOT NULL DEFAULT 24,
    "support" JSONB NOT NULL DEFAULT '{}',
    "social" JSONB NOT NULL DEFAULT '{}',
    "legal" JSONB NOT NULL DEFAULT '{}',
    "support_sla_high" INTEGER NOT NULL DEFAULT 4,
    "support_sla_normal" INTEGER NOT NULL DEFAULT 24,
    "alert_escalation_hours" INTEGER NOT NULL DEFAULT 4,
    "review_amount" INTEGER NOT NULL DEFAULT 500000,
    "cash_preparation_alert_hours" INTEGER NOT NULL DEFAULT 24,
    "assistant_monthly_budget" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_information_pkey" PRIMARY KEY ("id")
);


-- Ajouts manuels : ligne unique et valeurs cohérentes
ALTER TABLE "shop_information" ADD CONSTRAINT "shop_information_single_row" CHECK ("id" = 1);
ALTER TABLE "shop_information" ADD CONSTRAINT "shop_information_delays_valid" CHECK (
  "mobile_money_expiry_hours" BETWEEN 1 AND 168 AND "support_sla_high" > 0 AND "support_sla_normal" > 0
  AND "alert_escalation_hours" > 0 AND "review_amount" >= 0 AND "cash_preparation_alert_hours" > 0
  AND "assistant_monthly_budget" >= 0
);
INSERT INTO "shop_information" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
