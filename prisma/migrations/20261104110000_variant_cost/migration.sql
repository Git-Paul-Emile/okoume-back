-- AlterTable
ALTER TABLE "variants" ADD COLUMN     "cost" DECIMAL(12,0);


-- Le coût d'achat est positif et reste sous le prix de vente
ALTER TABLE "variants" ADD CONSTRAINT "variants_cost_below_price" CHECK ("cost" IS NULL OR ("cost" > 0 AND "cost" < "price"));
