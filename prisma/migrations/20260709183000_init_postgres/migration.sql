-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "region" TEXT,
    "vpOwnerId" TEXT,
    "directorId" TEXT,
    "accountManagerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "logoUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbrCycle" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "meetingDate" TIMESTAMP(3),
    "nextMeetingDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT_CREATED',
    "createdById" TEXT,
    "previousQbrNotes" TEXT,
    "deckOptionsJson" TEXT NOT NULL DEFAULT '{}',
    "language" TEXT,
    "agendaSectionsJson" TEXT,
    "deckLayoutJson" TEXT NOT NULL DEFAULT '{}',
    "editorProgressJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QbrCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorMessage" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "section" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT,
    "providerThreadId" TEXT,
    "conversationId" TEXT,
    "subject" TEXT,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "direction" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,
    "internetMessageId" TEXT,
    "conversationId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT,
    "qbrCycleId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileUrl" TEXT,
    "extractedText" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "isClientSafe" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorityItem" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "category" TEXT,
    "needsDecision" BOOLEAN NOT NULL DEFAULT false,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PriorityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardMetric" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "source" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "isClientSafe" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DashboardMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpcomingItem" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawInput" TEXT,
    "clientReadyText" TEXT,
    "timing" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UpcomingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingInfoRequest" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "assignedToEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "MissingInfoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fileUrl" TEXT,
    "title" TEXT,
    "contentJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "approverEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientSurvey" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "clientContactId" TEXT,
    "overallScore" INTEGER,
    "serviceQualityScore" INTEGER,
    "issueResolutionScore" INTEGER,
    "communicationScore" INTEGER,
    "adminScore" INTEGER,
    "billingScore" INTEGER,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalSentimentSurvey" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "perceivedClientScore" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalSentimentSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "actorEmail" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sharedMailbox" TEXT NOT NULL DEFAULT 'qbr@gdi.com',
    "senderDisplayName" TEXT NOT NULL DEFAULT 'GDI BR Creation Agent',
    "reminderCadenceJson" TEXT NOT NULL DEFAULT '{}',
    "clientSurveyTemplateJson" TEXT NOT NULL DEFAULT '[]',
    "internalSurveyTemplateJson" TEXT NOT NULL DEFAULT '[]',
    "rolePermissionsJson" TEXT NOT NULL DEFAULT '{}',
    "requireVpApproval" BOOLEAN NOT NULL DEFAULT true,
    "allowFinalizeOverride" BOOLEAN NOT NULL DEFAULT false,
    "pptTemplatePath" TEXT,
    "dataSourcePlaceholdersJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_vpOwnerId_fkey" FOREIGN KEY ("vpOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_accountManagerId_fkey" FOREIGN KEY ("accountManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbrCycle" ADD CONSTRAINT "QbrCycle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbrCycle" ADD CONSTRAINT "QbrCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorMessage" ADD CONSTRAINT "EditorMessage_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorityItem" ADD CONSTRAINT "PriorityItem_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetric" ADD CONSTRAINT "DashboardMetric_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpcomingItem" ADD CONSTRAINT "UpcomingItem_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingInfoRequest" ADD CONSTRAINT "MissingInfoRequest_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurvey" ADD CONSTRAINT "ClientSurvey_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSurvey" ADD CONSTRAINT "ClientSurvey_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalSentimentSurvey" ADD CONSTRAINT "InternalSentimentSurvey_qbrCycleId_fkey" FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
