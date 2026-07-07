-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "inReplyTo" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "internetMessageId" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN "references" TEXT;

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN "conversationId" TEXT;
