-- AlterTable
ALTER TABLE "products" ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0;

-- Rules Prisma cannot express in the schema
-- A discount is a whole percent from 0 (none) to 90, so a card is never free or negative.
ALTER TABLE "products" ADD CONSTRAINT "products_discount_percent_check" CHECK ("discount_percent" BETWEEN 0 AND 90);
