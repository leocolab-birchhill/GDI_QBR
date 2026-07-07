-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Viewer',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientName" TEXT NOT NULL,
    "region" TEXT,
    "vpOwnerId" TEXT,
    "directorId" TEXT,
    "accountManagerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_vpOwnerId_fkey" FOREIGN KEY ("vpOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ClientContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QbrCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "meetingDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_CREATED',
    "createdById" TEXT,
    "previousQbrNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QbrCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QbrCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT,
    "providerThreadId" TEXT,
    "subject" TEXT,
    CONSTRAINT "EmailThread_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "direction" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailMessageId" TEXT,
    "qbrCycleId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileUrl" TEXT,
    "extractedText" TEXT,
    CONSTRAINT "Attachment_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "owner" TEXT,
    "dueDate" DATETIME,
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "isClientSafe" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Commitment_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriorityItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "category" TEXT,
    "needsDecision" BOOLEAN NOT NULL DEFAULT false,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PriorityItem_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "source" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "owner" TEXT,
    "dueDate" DATETIME,
    "isClientSafe" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DashboardMetric_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UpcomingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UpcomingItem_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MissingInfoRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "assignedToEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "dueDate" DATETIME,
    CONSTRAINT "MissingInfoRequest_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fileUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeckVersion_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "approverEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "clientContactId" TEXT,
    "overallScore" INTEGER,
    "serviceQualityScore" INTEGER,
    "issueResolutionScore" INTEGER,
    "communicationScore" INTEGER,
    "adminScore" INTEGER,
    "billingScore" INTEGER,
    "comments" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientSurvey_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientSurvey_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InternalSentimentSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qbrCycleId" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "perceivedClientScore" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalSentimentSurvey_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "actorEmail" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "sharedMailbox" TEXT NOT NULL DEFAULT 'qbr@gdi.com',
    "senderDisplayName" TEXT NOT NULL DEFAULT 'GDI QBR OS',
    "reminderCadenceJson" TEXT NOT NULL DEFAULT '{}',
    "clientSurveyTemplateJson" TEXT NOT NULL DEFAULT '[]',
    "internalSurveyTemplateJson" TEXT NOT NULL DEFAULT '[]',
    "rolePermissionsJson" TEXT NOT NULL DEFAULT '{}',
    "requireVpApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowFinalizeOverride" BOOLEAN NOT NULL DEFAULT false,
    "pptTemplatePath" TEXT,
    "dataSourcePlaceholdersJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
