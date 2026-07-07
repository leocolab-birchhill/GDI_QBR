import { describe, expect, it } from "vitest";
import {
  attentionQueue,
  buildAttention,
  buildAggregates,
  daysUntil,
  filterCycles,
  reminderMilestone,
  toDashboardCycle,
} from "@/lib/qbr/dashboard";

function raw(overrides: Partial<Parameters<typeof toDashboardCycle>[0]> = {}) {
  return {
    id: "q1",
    quarter: "Q1",
    year: 2026,
    status: "COLLECTING_INPUTS",
    meetingDate: new Date("2026-07-16"),
    account: {
      clientName: "McGill University",
      region: "Quebec",
      vpOwner: { id: "vp1", name: "Bruno", email: "bruno@gdi.com" },
      director: null,
      accountManager: null,
    },
    missingInfoRequests: [],
    dashboardMetrics: [],
    deckVersions: [],
    approvals: [],
    emailThreads: [],
    ...overrides,
  };
}

describe("dashboard helpers", () => {
  it("flags VP review when draft exists without approval", () => {
    const attention = buildAttention(
      raw({ deckVersions: [{ versionNumber: 1, status: "draft" }] }),
      30,
      null,
    );
    expect(attention.some((a) => a.kind === "vp_review")).toBe(true);
  });

  it("flags meeting soon within 14 days", () => {
    const attention = buildAttention(raw(), 10, null);
    expect(attention.some((a) => a.kind === "meeting_soon")).toBe(true);
  });

  it("aggregates active QBR counts", () => {
    const cycles = [
      toDashboardCycle(raw({ deckVersions: [{ versionNumber: 1, status: "draft" }] })),
      toDashboardCycle(raw({ id: "q2", status: "CLOSED" })),
    ];
    const agg = buildAggregates(cycles);
    expect(agg.total).toBe(2);
    expect(agg.active).toBe(1);
    expect(agg.needsVpReview).toBe(1);
  });

  it("filters by attention preset", () => {
    const cycles = [
      toDashboardCycle(raw({ deckVersions: [{ versionNumber: 1, status: "draft" }] })),
      toDashboardCycle(raw({ id: "q2", approvals: [{ status: "approved" }], deckVersions: [{ versionNumber: 1, status: "draft" }] })),
    ];
    const vpReview = filterCycles(cycles, { search: "", status: "", vpId: "", attention: "vp_review" });
    expect(vpReview).toHaveLength(1);
  });

  it("sorts attention queue by urgency", () => {
    const urgent = toDashboardCycle(raw({ meetingDate: new Date(Date.now() + 3 * 86400000) }));
    const calm = toDashboardCycle(raw({ id: "calm", meetingDate: new Date(Date.now() + 60 * 86400000) }));
    const queue = attentionQueue([calm, urgent]);
    expect(queue[0].id).toBe("q1");
  });

  it("maps reminder milestones", () => {
    expect(reminderMilestone(10)).toBe("Draft due zone");
    expect(reminderMilestone(25)).toBe("VP prep window");
  });

  it("computes days until meeting", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(future)).toBe(5);
  });
});
