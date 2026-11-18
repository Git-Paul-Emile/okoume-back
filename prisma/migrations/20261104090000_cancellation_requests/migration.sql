-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'accepted', 'refused');

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "decision_reason" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_requests_order_id_key" ON "cancellation_requests"("order_id");

-- CreateIndex
CREATE INDEX "cancellation_requests_status_created_at_idx" ON "cancellation_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Une décision porte toujours un auteur et une date ; une demande en attente n'en a pas
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_decision_complete" CHECK (
  ("status" = 'pending' AND "decided_at" IS NULL) OR ("status" <> 'pending' AND "decided_at" IS NOT NULL)
);
