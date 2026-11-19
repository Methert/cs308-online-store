-- CreateEnum
CREATE TYPE "card_condition" AS ENUM ('mint', 'near_mint', 'excellent', 'good', 'played', 'poor');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "release_date" DATE,
ADD COLUMN     "series" TEXT,
ADD COLUMN     "set_code" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "condition" "card_condition" NOT NULL DEFAULT 'near_mint',
ADD COLUMN     "rarity" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "categories_set_code_key" ON "categories"("set_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_serial_number_key" ON "products"("serial_number");

-- CreateIndex
CREATE INDEX "products_rarity_idx" ON "products"("rarity");

-- Rules Prisma cannot express in the schema
ALTER TABLE "products" ADD CONSTRAINT "products_rarity_check" CHECK (btrim("rarity") <> '');
