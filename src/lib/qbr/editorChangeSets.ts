import { prisma } from "../db";
import { audit } from "../audit";
import { z } from "zod";
import {
  DeckPatchSchema,
  FieldChangeSchema,
  SlideEditOpSchema,
  type DeckPatch,
  type EditorProposal,
  type ReviewResult,
  type SlideEditOp,
} from "../ai/schemas";
import { applyDeckPatches } from "./deckPatches";
import { applySlideEdits } from "./service";

type JsonObject = Record<string, unknown>;

interface EditableSnapshot {
  account: { id: string; clientName: string };
  cycle: {
    meetingDate: Date | string | null;
    nextMeetingDate: Date | string | null;
    agendaSectionsJson: string | null;
    deckLayoutJson: string;
    deckOptionsJson: string;
  };
  commitments: JsonObject[];
  priorityItems: JsonObject[];
  dashboardMetrics: JsonObject[];
  upcomingItems: JsonObject[];
}

function parseArray<T>(value: string, schema: z.ZodType<T>): T[] {
  return z.array(schema).parse(JSON.parse(value));
}

export async function captureEditorSnapshot(qbrCycleId: string): Promise<EditableSnapshot> {
  const cycle = await prisma.qbrCycle.findUnique({
    where: { id: qbrCycleId },
    include: {
      account: true,
      commitments: true,
      priorityItems: true,
      dashboardMetrics: true,
      upcomingItems: true,
    },
  });
  if (!cycle) throw new Error("QBR not found");
  return {
    account: { id: cycle.account.id, clientName: cycle.account.clientName },
    cycle: {
      meetingDate: cycle.meetingDate,
      nextMeetingDate: cycle.nextMeetingDate,
      agendaSectionsJson: cycle.agendaSectionsJson,
      deckLayoutJson: cycle.deckLayoutJson,
      deckOptionsJson: cycle.deckOptionsJson,
    },
    commitments: cycle.commitments as unknown as JsonObject[],
    priorityItems: cycle.priorityItems as unknown as JsonObject[],
    dashboardMetrics: cycle.dashboardMetrics as unknown as JsonObject[],
    upcomingItems: cycle.upcomingItems as unknown as JsonObject[],
  };
}

export async function createEditorProposal(args: {
  qbrCycleId: string;
  proposal: EditorProposal;
  message?: string;
  actorEmail?: string;
  actorName?: string;
  review?: ReviewResult | null;
}) {
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: args.qbrCycleId } });
  if (!cycle) throw new Error("QBR not found");
  const row = await prisma.editorChangeSet.create({
    data: {
      qbrCycleId: args.qbrCycleId,
      status: "proposed",
      section: args.proposal.section ?? null,
      actorEmail: args.actorEmail ?? null,
      actorName: args.actorName ?? null,
      message: args.message ?? null,
      operationsJson: JSON.stringify(args.proposal.operations),
      patchesJson: JSON.stringify(args.proposal.patches),
      fieldChangesJson: JSON.stringify(args.proposal.fieldChanges),
      baseRevision: cycle.updatedAt,
      confidence: args.proposal.confidence,
      explanation: args.proposal.explanation,
      reviewJson: args.review ? JSON.stringify(args.review) : null,
    },
  });
  await audit({
    entityType: "EditorChangeSet",
    entityId: row.id,
    action: "editor.proposal_created",
    actorEmail: args.actorEmail,
    metadata: { qbrCycleId: args.qbrCycleId, section: args.proposal.section },
  });
  return row;
}

export async function acceptEditorProposal(
  qbrCycleId: string,
  changeSetId: string,
  actorEmail?: string,
) {
  const changeSet = await prisma.editorChangeSet.findFirst({
    where: { id: changeSetId, qbrCycleId },
  });
  if (!changeSet) throw new Error("Proposal not found");
  if (changeSet.status !== "proposed") throw new Error(`Proposal is already ${changeSet.status}`);

  // Claim the exact revision the proposal was prepared against.
  const claimed = await prisma.qbrCycle.updateMany({
    where: { id: qbrCycleId, updatedAt: changeSet.baseRevision },
    data: { updatedAt: new Date() },
  });
  if (claimed.count !== 1) {
    await prisma.editorChangeSet.update({
      where: { id: changeSet.id },
      data: { status: "stale" },
    });
    throw new Error("This proposal is stale because the deck changed. Ask the agent to prepare it again.");
  }

  const operations = parseArray<SlideEditOp>(changeSet.operationsJson, SlideEditOpSchema);
  const patches = parseArray<DeckPatch>(changeSet.patchesJson, DeckPatchSchema);
  const before = await captureEditorSnapshot(qbrCycleId);
  let appliedOps: string[];
  let patchResult: Awaited<ReturnType<typeof applyDeckPatches>>;
  try {
    appliedOps = await applySlideEdits(qbrCycleId, operations);
    patchResult = await applyDeckPatches(qbrCycleId, patches);
  } catch (error) {
    // Existing edit helpers use the shared Prisma client. Restore the complete
    // editable snapshot so a failed multi-operation proposal remains atomic.
    await restoreSnapshot(qbrCycleId, before);
    throw error;
  }
  const after = await captureEditorSnapshot(qbrCycleId);
  const changes = [...appliedOps, ...patchResult.changes];

  const updated = await prisma.editorChangeSet.update({
    where: { id: changeSet.id },
    data: {
      status: "applied",
      beforeSnapshotJson: JSON.stringify(before),
      afterSnapshotJson: JSON.stringify(after),
      appliedAt: new Date(),
    },
  });
  await audit({
    entityType: "EditorChangeSet",
    entityId: changeSet.id,
    action: "editor.proposal_applied",
    actorEmail,
    metadata: { qbrCycleId, changes },
  });
  return { changeSet: updated, changes, operations, patches };
}

export async function rejectEditorProposal(
  qbrCycleId: string,
  changeSetId: string,
  actorEmail?: string,
) {
  const result = await prisma.editorChangeSet.updateMany({
    where: { id: changeSetId, qbrCycleId, status: "proposed" },
    data: { status: "rejected", rejectedAt: new Date() },
  });
  if (result.count !== 1) throw new Error("Proposal is unavailable or already resolved");
  await audit({
    entityType: "EditorChangeSet",
    entityId: changeSetId,
    action: "editor.proposal_rejected",
    actorEmail,
    metadata: { qbrCycleId },
  });
}

async function restoreSnapshot(qbrCycleId: string, snapshot: EditableSnapshot) {
  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: snapshot.account.id },
      data: { clientName: snapshot.account.clientName },
    });
    await tx.qbrCycle.update({
      where: { id: qbrCycleId },
      data: snapshot.cycle,
    });
    await tx.commitment.deleteMany({ where: { qbrCycleId } });
    await tx.priorityItem.deleteMany({ where: { qbrCycleId } });
    await tx.dashboardMetric.deleteMany({ where: { qbrCycleId } });
    await tx.upcomingItem.deleteMany({ where: { qbrCycleId } });
    if (snapshot.commitments.length) await tx.commitment.createMany({ data: snapshot.commitments as never[] });
    if (snapshot.priorityItems.length) await tx.priorityItem.createMany({ data: snapshot.priorityItems as never[] });
    if (snapshot.dashboardMetrics.length) await tx.dashboardMetric.createMany({ data: snapshot.dashboardMetrics as never[] });
    if (snapshot.upcomingItems.length) await tx.upcomingItem.createMany({ data: snapshot.upcomingItems as never[] });
  });
}

export async function undoLastEditorChange(qbrCycleId: string, actorEmail?: string) {
  const last = await prisma.editorChangeSet.findFirst({
    where: { qbrCycleId, status: "applied", revertedAt: null },
    orderBy: { appliedAt: "desc" },
  });
  if (!last?.beforeSnapshotJson) throw new Error("There is no applied agent change to undo");
  const current = await captureEditorSnapshot(qbrCycleId);
  const before = JSON.parse(last.beforeSnapshotJson) as EditableSnapshot;
  await restoreSnapshot(qbrCycleId, before);
  const reverted = await prisma.editorChangeSet.create({
    data: {
      qbrCycleId,
      status: "applied",
      section: last.section,
      actorEmail: actorEmail ?? null,
      message: `Undo ${last.id}`,
      baseRevision: new Date(),
      beforeSnapshotJson: JSON.stringify(current),
      afterSnapshotJson: JSON.stringify(before),
      revertsId: last.id,
      appliedAt: new Date(),
    },
  });
  await prisma.editorChangeSet.update({
    where: { id: last.id },
    data: { status: "reverted", revertedAt: new Date() },
  });
  await audit({
    entityType: "EditorChangeSet",
    entityId: reverted.id,
    action: "editor.change_reverted",
    actorEmail,
    metadata: { qbrCycleId, revertedId: last.id },
  });
  return reverted;
}

export async function listEditorChangeSets(qbrCycleId: string, take = 30) {
  return prisma.editorChangeSet.findMany({
    where: { qbrCycleId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function proposalFieldChanges(value: string) {
  return FieldChangeSchema.array().parse(JSON.parse(value));
}
