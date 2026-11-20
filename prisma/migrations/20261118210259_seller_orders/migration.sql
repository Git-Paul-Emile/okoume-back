-- AlterEnum
ALTER TYPE "OrderActor" ADD VALUE 'seller';

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "staff_id" DROP NOT NULL;
