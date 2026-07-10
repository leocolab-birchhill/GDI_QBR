import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeFindFirst: vi.fn(),
  changeCreate: vi.fn(),
  changeUpdate: vi.fn(),
  changeUpdateMany: vi.fn(),
  cycleFindUnique: vi.fn(),
  cycleUpdateMany: vi.fn(),
  applySlideEdits: vi.fn(),
  applyDeckPatches: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    editorChangeSet: {
      findFirst: mocks.changeFindFirst,
      create: mocks.changeCreate,
      update: mocks.changeUpdate,
      updateMany: mocks.changeUpdateMany,
    },
    qbrCycle: { findUnique: mocks.cycleFindUnique, updateMany: mocks.cycleUpdateMany },
  },
}));
vi.mock("@/lib/qbr/service", () => ({ applySlideEdits: mocks.applySlideEdits }));
vi.mock("@/lib/qbr/deckPatches", () => ({ applyDeckPatches: mocks.applyDeckPatches }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { acceptEditorProposal, createEditorProposal, rejectEditorProposal, undoLastEditorChange } from "@/lib/qbr/editorChangeSets";

describe("editor change-set concurrency", () => {
  it("persists a natural-language proposal without mutating deck data", async () => {
    const revision = new Date("2026-07-10T10:00:00Z");
    mocks.cycleFindUnique.mockResolvedValue({ id: "qbr-1", updatedAt: revision });
    mocks.changeCreate.mockResolvedValue({ id: "change-1", status: "proposed" });
    await createEditorProposal({
      qbrCycleId: "qbr-1",
      message: "Set inspection score to 92%",
      proposal: {
        reply: "I prepared the metric.",
        section: "dashboard",
        confidence: 0.9,
        explanation: "Explicit value",
        clarificationQuestion: null,
        fieldChanges: [{ field: "Inspection score", before: "To confirm", after: "92%" }],
        operations: [{ type: "set_metric", label: "Inspection score", value: "92%" }],
        patches: [],
        regenerate: true,
        suggestions: [],
      },
    });
    expect(mocks.changeCreate).toHaveBeenCalled();
    expect(mocks.applySlideEdits).not.toHaveBeenCalled();
    expect(mocks.applyDeckPatches).not.toHaveBeenCalled();
  });

  beforeEach(() => vi.clearAllMocks());

  it("marks a proposal stale and never mutates when the base revision changed", async () => {
    mocks.changeFindFirst.mockResolvedValue({
      id: "change-1",
      qbrCycleId: "qbr-1",
      status: "proposed",
      baseRevision: new Date("2026-07-10T10:00:00Z"),
      operationsJson: "[]",
      patchesJson: "[]",
    });
    mocks.cycleUpdateMany.mockResolvedValue({ count: 0 });
    mocks.changeUpdate.mockResolvedValue({ id: "change-1", status: "stale" });

    await expect(acceptEditorProposal("qbr-1", "change-1")).rejects.toThrow(/stale/i);
    expect(mocks.changeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: "stale" },
    }));
    expect(mocks.applySlideEdits).not.toHaveBeenCalled();
    expect(mocks.applyDeckPatches).not.toHaveBeenCalled();
  });

  it("rejects a pending proposal without applying it", async () => {
    mocks.changeUpdateMany.mockResolvedValue({ count: 1 });
    await rejectEditorProposal("qbr-1", "change-1", "owner@example.com");
    expect(mocks.changeUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "proposed" }),
      data: expect.objectContaining({ status: "rejected" }),
    }));
    expect(mocks.applySlideEdits).not.toHaveBeenCalled();
  });

  it("refuses undo when there is no applied agent change", async () => {
    mocks.changeFindFirst.mockResolvedValue(null);
    await expect(undoLastEditorChange("qbr-1")).rejects.toThrow(/no applied agent change/i);
  });
});
