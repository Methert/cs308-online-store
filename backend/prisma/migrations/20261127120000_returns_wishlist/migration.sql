-- CreateEnum
CREATE TYPE "return_status" AS ENUM ('requested', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "return_requests" (
    "id" SERIAL NOT NULL,
    "order_item_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "return_status" NOT NULL DEFAULT 'requested',
    "refund_amount" DECIMAL(10,2) NOT NULL,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_list_items" (
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wish_list_items_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateIndex
CREATE INDEX "return_requests_order_item_id_idx" ON "return_requests"("order_item_id");

-- CreateIndex
CREATE INDEX "return_requests_user_id_idx" ON "return_requests"("user_id");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "wish_list_items_product_id_idx" ON "wish_list_items"("product_id");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_list_items" ADD CONSTRAINT "wish_list_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_list_items" ADD CONSTRAINT "wish_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules Prisma cannot express in the schema
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_refund_amount_check" CHECK ("refund_amount" >= 0);
-- An approved or rejected request records when it was decided; an open one has no decision yet.
-- (reviewed_by is not part of the rule because deleting a staff account sets it to NULL.)
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_review_check" CHECK (
    ("status" = 'requested') = ("reviewed_at" IS NULL)
    AND ("status" <> 'requested' OR "reviewed_by" IS NULL)
);

-- Keep Supabase's public API closed: no policies, so only the backend (table owner) can read or write.
ALTER TABLE "return_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wish_list_items" ENABLE ROW LEVEL SECURITY;
