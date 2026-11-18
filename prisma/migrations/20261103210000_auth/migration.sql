-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('pending_verification', 'active', 'anonymized');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('super_admin', 'catalog_manager', 'orders_manager', 'stock_manager');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('invited', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('email_verification', 'password_reset', 'staff_login', 'contact_change');

-- CreateEnum
CREATE TYPE "LoginSubject" AS ENUM ('customer', 'staff');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone_key" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'pending_verification',
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "extra_roles" "StaffRole"[] DEFAULT ARRAY[]::"StaffRole"[],
    "status" "StaffStatus" NOT NULL DEFAULT 'invited',
    "refund_limit" DECIMAL(12,0),
    "sessions_revoked_at" TIMESTAMP(3),
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_custom_roles" (
    "staff_id" UUID NOT NULL,
    "custom_role_id" UUID NOT NULL,

    CONSTRAINT "staff_custom_roles_pkey" PRIMARY KEY ("staff_id","custom_role_id")
);

-- CreateTable
CREATE TABLE "backup_codes" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "customer_id" UUID,
    "staff_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "subject_id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" UUID NOT NULL,
    "subject_type" "LoginSubject" NOT NULL,
    "subject_id" UUID,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key_key" ON "customers"("phone_key");

-- CreateIndex
CREATE INDEX "customers_status_last_login_at_idx" ON "customers"("status", "last_login_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_email_key" ON "staff_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_invite_token_hash_key" ON "staff_members"("invite_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_name_key" ON "custom_roles"("name");

-- CreateIndex
CREATE INDEX "staff_custom_roles_custom_role_id_idx" ON "staff_custom_roles"("custom_role_id");

-- CreateIndex
CREATE INDEX "backup_codes_staff_id_idx" ON "backup_codes"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE INDEX "sessions_customer_id_idx" ON "sessions"("customer_id");

-- CreateIndex
CREATE INDEX "sessions_staff_id_idx" ON "sessions"("staff_id");

-- CreateIndex
CREATE INDEX "verification_codes_subject_id_purpose_idx" ON "verification_codes"("subject_id", "purpose");

-- CreateIndex
CREATE INDEX "login_events_created_at_idx" ON "login_events"("created_at");

-- CreateIndex
CREATE INDEX "login_events_subject_type_subject_id_idx" ON "login_events"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "staff_custom_roles" ADD CONSTRAINT "staff_custom_roles_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_custom_roles" ADD CONSTRAINT "staff_custom_roles_custom_role_id_fkey" FOREIGN KEY ("custom_role_id") REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_codes" ADD CONSTRAINT "backup_codes_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier portées par la base : une session appartient à un seul titulaire,
-- un code n'est jamais tenté plus de cinq fois, un plafond de remboursement n'est jamais négatif.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_single_subject"
  CHECK (("customer_id" IS NOT NULL) <> ("staff_id" IS NOT NULL));
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_attempts_range"
  CHECK ("attempts" BETWEEN 0 AND 5);
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_refund_limit_positive"
  CHECK ("refund_limit" IS NULL OR "refund_limit" >= 0);
