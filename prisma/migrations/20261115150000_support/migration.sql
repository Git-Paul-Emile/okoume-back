-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('commande', 'livraison', 'retour', 'produit', 'compte', 'publicite');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('normal', 'high');

-- CreateEnum
CREATE TYPE "TicketAuthor" AS ENUM ('customer', 'support');

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "order_number" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "satisfaction" INTEGER,
    "assignee_id" UUID,
    "closure_reason" TEXT,
    "resolved_at" TIMESTAMP(3),
    "reopened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author" "TicketAuthor" NOT NULL,
    "staff_id" UUID,
    "body" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_number_key" ON "support_tickets"("number");

-- CreateIndex
CREATE INDEX "support_tickets_customer_id_created_at_idx" ON "support_tickets"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ajouts manuels
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_satisfaction_range" CHECK ("satisfaction" IS NULL OR "satisfaction" BETWEEN 1 AND 5);
-- Une demande résolue ou clôturée porte toujours sa solution, communiquée au client
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_closure_reason" CHECK ("status" NOT IN ('resolved', 'closed') OR "closure_reason" IS NOT NULL);
-- Un message du client ne porte jamais d'auteur de l'équipe (celui d'une réponse peut être retiré avec son compte)
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_staff_author" CHECK ("author" = 'support' OR "staff_id" IS NULL);
