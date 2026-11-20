-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "card_holder" TEXT NOT NULL,
    "card_last4" CHAR(4) NOT NULL,
    "card_hash" TEXT NOT NULL,
    "bank_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "total_price" DECIMAL(10,2) NOT NULL,
    "pdf_path" TEXT,
    "emailed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_created_at_idx" ON "invoices"("created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma cannot express in the schema
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_card_last4_check" CHECK ("card_last4" ~ '^[0-9]{4}$');
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_price_check" CHECK ("total_price" >= 0);

-- Keep Supabase's public API closed: no policies, so only the backend (table owner) can read or write.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;

-- Delivery list for product managers (requirement 12): one row per ordered product.
-- security_invoker makes the view obey the row level security of its tables, so Supabase's
-- public API cannot read through it.
CREATE VIEW "delivery_list" WITH (security_invoker = true) AS
SELECT
    oi."id"                          AS "delivery_id",
    o."id"                           AS "order_id",
    o."user_id"                      AS "customer_id",
    oi."product_id"                  AS "product_id",
    oi."quantity"                    AS "quantity",
    oi."quantity" * oi."unit_price"  AS "total_price",
    o."delivery_address"             AS "delivery_address",
    o."status"                       AS "status",
    o."status" = 'delivered'         AS "completed",
    o."created_at"                   AS "ordered_at"
FROM "order_items" oi
JOIN "orders" o ON o."id" = oi."order_id"
WHERE o."status" <> 'cancelled';
