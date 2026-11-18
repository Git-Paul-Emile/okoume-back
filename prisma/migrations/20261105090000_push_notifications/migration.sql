-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "notification_prefs" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "customer_id" UUID,
    "staff_id" UUID,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3),

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_deliveries" (
    "notification_id" TEXT NOT NULL,
    "subscription_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("notification_id","subscription_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_customer_id_idx" ON "push_subscriptions"("customer_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_staff_id_idx" ON "push_subscriptions"("staff_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un abonnement appartient à un client ou à un membre de l'équipe, jamais aux deux ni à personne
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_single_owner" CHECK (
  ("customer_id" IS NOT NULL AND "staff_id" IS NULL) OR ("customer_id" IS NULL AND "staff_id" IS NOT NULL)
);
