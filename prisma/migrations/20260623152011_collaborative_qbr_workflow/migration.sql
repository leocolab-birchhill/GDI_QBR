-- CreateTable
CREATE TABLE "EditorMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorMessage_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientName" TEXT NOT NULL,
    "region" TEXT,
    "vpOwnerId" TEXT,
    "directorId" TEXT,
    "accountManagerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "logoUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_vpOwnerId_fkey" FOREIGN KEY ("vpOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("accountManagerId", "clientName", "createdAt", "directorId", "id", "region", "status", "vpOwnerId") SELECT "accountManagerId", "clientName", "createdAt", "directorId", "id", "region", "status", "vpOwnerId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
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
    "language" TEXT,
    "agendaSectionsJson" TEXT,
    "editorProgressJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QbrCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QbrCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QbrCycle" ("accountId", "createdAt", "createdById", "deckOptionsJson", "id", "meetingDate", "nextMeetingDate", "previousQbrNotes", "quarter", "status", "updatedAt", "year") SELECT "accountId", "createdAt", "createdById", "deckOptionsJson", "id", "meetingDate", "nextMeetingDate", "previousQbrNotes", "quarter", "status", "updatedAt", "year" FROM "QbrCycle";
DROP TABLE "QbrCycle";
ALTER TABLE "new_QbrCycle" RENAME TO "QbrCycle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
