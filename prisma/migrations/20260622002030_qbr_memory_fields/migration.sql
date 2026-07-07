-- AlterTable
ALTER TABLE "DeckVersion" ADD COLUMN "contentJson" TEXT;
ALTER TABLE "DeckVersion" ADD COLUMN "title" TEXT;

-- AlterTable
ALTER TABLE "QbrCycle" ADD COLUMN "nextMeetingDate" DATETIME;
