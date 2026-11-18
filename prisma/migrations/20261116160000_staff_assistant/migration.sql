-- CreateEnum
CREATE TYPE "AssistantDecisionKind" AS ENUM ('accepted', 'refused', 'postponed', 'executed');

-- CreateTable
CREATE TABLE "assistant_decisions" (
    "id" UUID NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "decision" "AssistantDecisionKind" NOT NULL,
    "reason" TEXT,
    "until" TIMESTAMP(3),
    "staff_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_actions" (
    "id" UUID NOT NULL,
    "proposal_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "applied_by_name" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverted_at" TIMESTAMP(3),
    "reverted_by_name" TEXT,

    CONSTRAINT "assistant_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_rules_versions" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "params" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_rules_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_questions" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_decisions_proposal_id_created_at_idx" ON "assistant_decisions"("proposal_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_actions_applied_at_idx" ON "assistant_actions"("applied_at");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_rules_versions_version_key" ON "assistant_rules_versions"("version");

-- CreateIndex
CREATE INDEX "assistant_questions_created_at_idx" ON "assistant_questions"("created_at");


-- Ajouts manuels
-- Un refus est toujours motivé, un report toujours daté
ALTER TABLE "assistant_decisions" ADD CONSTRAINT "assistant_decisions_refusal_reason" CHECK ("decision" <> 'refused' OR "reason" IS NOT NULL);
ALTER TABLE "assistant_decisions" ADD CONSTRAINT "assistant_decisions_postponed_until" CHECK ("decision" <> 'postponed' OR "until" IS NOT NULL);
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_reverted_by" CHECK (("reverted_at" IS NULL) = ("reverted_by_name" IS NULL));
ALTER TABLE "assistant_rules_versions" ADD CONSTRAINT "assistant_rules_versions_positive" CHECK ("version" >= 1);
