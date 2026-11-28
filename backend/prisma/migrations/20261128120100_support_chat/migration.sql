-- CreateEnum
CREATE TYPE "chat_status" AS ENUM ('waiting', 'active', 'closed');

-- CreateEnum
CREATE TYPE "chat_sender" AS ENUM ('customer', 'agent');

-- CreateTable
CREATE TABLE "support_conversations" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "guest_token" TEXT,
    "guest_name" TEXT,
    "status" "chat_status" NOT NULL DEFAULT 'waiting',
    "agent_id" INTEGER,
    "claimed_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "sender_type" "chat_sender" NOT NULL,
    "sender_id" INTEGER,
    "body" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_attachments" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_conversations_status_created_at_idx" ON "support_conversations"("status", "created_at");

-- CreateIndex
CREATE INDEX "support_conversations_agent_id_idx" ON "support_conversations"("agent_id");

-- CreateIndex
CREATE INDEX "support_conversations_customer_id_idx" ON "support_conversations"("customer_id");

-- CreateIndex
CREATE INDEX "support_conversations_guest_token_idx" ON "support_conversations"("guest_token");

-- CreateIndex
CREATE INDEX "support_messages_conversation_id_created_at_idx" ON "support_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "support_attachments_message_id_idx" ON "support_attachments"("message_id");

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules Prisma cannot express in the schema
-- Every conversation belongs to a signed-in customer or to a guest's browser token.
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_owner_check" CHECK ("customer_id" IS NOT NULL OR "guest_token" IS NOT NULL);
-- Waiting = in the queue, not claimed yet. Active or closed = it was claimed (agent_id can become
-- empty later if the agent's account is deleted, so the rule uses claimed_at).
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_claim_check" CHECK (
    ("status" = 'waiting') = ("claimed_at" IS NULL)
    AND ("status" <> 'waiting' OR "agent_id" IS NULL)
);
-- Closed exactly when closed_at is set.
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_closed_check" CHECK (("status" = 'closed') = ("closed_at" IS NOT NULL));
-- A text message is not blank; a message may have no text when it only carries an attachment.
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_body_check" CHECK ("body" IS NULL OR (length(btrim("body")) > 0 AND length("body") <= 5000));
-- Only PDF, image and video files, up to 25 MB.
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_mime_type_check" CHECK ("mime_type" ~ '^(application/pdf|image/(jpeg|png|gif|webp)|video/(mp4|webm|quicktime))$');
ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_size_bytes_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 26214400);

-- Keep Supabase's public API closed: no policies, so only the backend (table owner) can read or write.
ALTER TABLE "support_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_attachments" ENABLE ROW LEVEL SECURITY;
