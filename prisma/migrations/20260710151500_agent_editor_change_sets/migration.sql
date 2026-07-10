CREATE TABLE "EditorChangeSet" (
    "id" TEXT NOT NULL,
    "qbrCycleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "section" TEXT,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "message" TEXT,
    "operationsJson" TEXT NOT NULL DEFAULT '[]',
    "patchesJson" TEXT NOT NULL DEFAULT '[]',
    "fieldChangesJson" TEXT NOT NULL DEFAULT '[]',
    "beforeSnapshotJson" TEXT,
    "afterSnapshotJson" TEXT,
    "baseRevision" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "explanation" TEXT,
    "reviewJson" TEXT,
    "revertsId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorChangeSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EditorChangeSet_qbrCycleId_createdAt_idx"
ON "EditorChangeSet"("qbrCycleId", "createdAt");

CREATE INDEX "EditorChangeSet_qbrCycleId_status_idx"
ON "EditorChangeSet"("qbrCycleId", "status");

ALTER TABLE "EditorChangeSet"
ADD CONSTRAINT "EditorChangeSet_qbrCycleId_fkey"
FOREIGN KEY ("qbrCycleId") REFERENCES "QbrCycle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
