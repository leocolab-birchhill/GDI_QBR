-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QbrCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "meetingDate" DATETIME,
    "nextMeetingDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_CREATED',
    "createdById" TEXT,
    "previousQbrNotes" TEXT,
    "deckOptionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QbrCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QbrCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QbrCycle" ("accountId", "createdAt", "createdById", "id", "meetingDate", "nextMeetingDate", "previousQbrNotes", "quarter", "status", "updatedAt", "year") SELECT "accountId", "createdAt", "createdById", "id", "meetingDate", "nextMeetingDate", "previousQbrNotes", "quarter", "status", "updatedAt", "year" FROM "QbrCycle";
DROP TABLE "QbrCycle";
ALTER TABLE "new_QbrCycle" RENAME TO "QbrCycle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
