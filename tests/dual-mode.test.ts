import { describe, it, expect } from "vitest";
import { determineMode, looksLikeQuestion } from "@/lib/qbr/mode";
import { fallbackClassify } from "@/lib/ai/fallbacks";
import { normalizeKey, sameItem, findExisting } from "@/lib/qbr/dedupe";
import { deterministicAnswer, AnswerContext } from "@/lib/qbr/answer";
import {
  buildEmailResponse,
  buildContextHeader,
  replySubjectFor,
  dedupeStrings,
  statusLabel,
} from "@/lib/email/responseBuilder";

// ── Dual-mode routing ─────────────────────────────────────────────────────────
describe("dual-mode intent routing", () => {
  it("routes an inbound question to Agent answer mode", () => {
    const subject = "Quick question";
    const body =
      "What else do you need from me for the McGill deck this quarter?";
    const intent = fallbackClassify({ subject, body }).intent;
    expect(determineMode(intent, { subject, body })).toBe("agent");
  });

  it("routes GENERAL_QUESTION to agent regardless of phrasing", () => {
    expect(
      determineMode("GENERAL_QUESTION", { subject: "x", body: "where are we" }),
    ).toBe("agent");
  });

  it("routes a structured update to Workflow mode", () => {
    const subject = "McGill update";
    const body = "No injuries this quarter. Average inspection score: 92%.";
    const intent = fallbackClassify({ subject, body }).intent;
    expect(determineMode(intent, { subject, body })).toBe("workflow");
  });

  it("keeps explicit action requests in workflow mode even when phrased as a question", () => {
    expect(
      determineMode("REQUEST_DRAFT", {
        subject: "deck",
        body: "Generate draft?",
      }),
    ).toBe("workflow");
    expect(
      determineMode("FINALIZE_DRAFT", { subject: "deck", body: "finalize" }),
    ).toBe("workflow");
  });

  it("looksLikeQuestion detects common QBR questions", () => {
    expect(looksLikeQuestion("What is missing?")).toBe(true);
    expect(looksLikeQuestion("Who owns the outstanding items?")).toBe(true);
    expect(looksLikeQuestion("Can you summarize the McGill deck?")).toBe(true);
    expect(looksLikeQuestion("Injuries reported: 0")).toBe(false);
  });
});

// ── Duplicate prevention ──────────────────────────────────────────────────────
describe("duplicate-prevention helpers", () => {
  it("normalizes labels for matching", () => {
    expect(normalizeKey("Injuries reported")).toBe("injuries reported");
    expect(normalizeKey("  Injuries  Reported! ")).toBe("injuries reported");
  });

  it("treats same label with different case/punctuation as the same item", () => {
    expect(
      sameItem("Average inspection score", "average inspection score!"),
    ).toBe(true);
    expect(sameItem("Injuries reported", "Outstanding invoices")).toBe(false);
  });

  it("findExisting returns the matching metric so it is not created twice", () => {
    const existing = [{ label: "Injuries reported", value: "0" }];
    const dup = findExisting(existing, "injuries reported", (m) => m.label);
    expect(dup).toBeDefined();
    const distinct = findExisting(existing, "Ticket counts", (m) => m.label);
    expect(distinct).toBeUndefined();
  });
});

// ── Agent answer (missing info, not duplicate captured metrics) ────────────────
function ctx(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    clientName: "McGill University",
    quarter: "Q1",
    year: 2026,
    status: "COLLECTING_INPUTS",
    commitments: [
      { action: "Confirm dock access", status: "Open", owner: null },
    ],
    priorities: [],
    metrics: [
      {
        group: "Health & Safety",
        label: "Injuries reported",
        value: "0",
        isConfirmed: true,
      },
    ],
    upcomingItems: [],
    missingInfo: [
      {
        field: "priorityItems",
        question: "2-3 priority items",
        status: "Open",
      },
      {
        field: "dashboardMetrics",
        question: "Dashboard metrics",
        status: "Open",
      },
      {
        field: "nextQbrDate",
        question: "Proposed next QBR date",
        status: "Open",
      },
    ],
    approvals: [],
    deckVersions: [],
    recentEmails: [],
    ...overrides,
  };
}

describe("agent answer mode", () => {
  it("'what else do you need?' returns a missing-info breakdown, not captured metrics", () => {
    const { answer } = deterministicAnswer(
      "What else do you need from me for the McGill deck this quarter?",
      ctx(),
    );
    expect(answer).toMatch(/what i still need|still need/i);
    expect(answer).toMatch(/Priority Items/);
    expect(answer).toMatch(/Dashboard/);
    expect(answer).toMatch(/What's Next/);
    // Must NOT echo the already-captured confirmed metric as a "captured" item.
    expect(answer).not.toContain("Injuries reported: 0");
  });

  it("'who owns the outstanding items?' lists owners and flags unassigned", () => {
    const { answer } = deterministicAnswer(
      "Who owns the outstanding items?",
      ctx(),
    );
    expect(answer).toMatch(/Confirm dock access/);
    expect(answer).toMatch(/not yet assigned/);
  });
});

// ── Context header on every email ──────────────────────────────────────────────
describe("buildEmailResponse context header", () => {
  it("every email includes BR, Status, and Mode lines", () => {
    const { text } = buildEmailResponse({
      qbrContext: {
        clientName: "McGill University",
        quarter: "Q1",
        year: 2026,
        status: "COLLECTING_INPUTS",
      },
      mode: "Answer",
      answerText: "Here's the latest.",
    });
    expect(text).toContain("BR: McGill University — Q1 2026");
    expect(text).toContain("Status: Collecting inputs");
    expect(text).toContain("Mode: Answer");
  });

  it("still produces a header when no cycle matched", () => {
    const header = buildContextHeader(null, "Missing info");
    expect(header).toMatch(/BR: \(could not match/);
    expect(header).toContain("Mode: Missing info");
  });

  it("does not repeat the same captured line twice", () => {
    const { text } = buildEmailResponse({
      qbrContext: {
        clientName: "X",
        quarter: "Q1",
        year: 2026,
        status: "COLLECTING_INPUTS",
      },
      mode: "Captured update",
      capturedItems: [
        "Health & Safety: Injuries reported = 0",
        "Health & Safety: Injuries reported = 0",
      ],
    });
    const occurrences = text.split("Injuries reported = 0").length - 1;
    expect(occurrences).toBe(1);
  });

  it("maps raw statuses to friendly labels", () => {
    expect(statusLabel("DRAFT_GENERATED")).toBe("Draft generated");
    expect(statusLabel("VP_REVIEW")).toBe("VP review");
  });

  it("replySubjectFor adds a single Re: prefix", () => {
    expect(replySubjectFor("McGill Q1 deck", null)).toBe("Re: McGill Q1 deck");
    expect(replySubjectFor("Re: McGill Q1 deck", null)).toBe(
      "Re: McGill Q1 deck",
    );
  });

  it("dedupeStrings is case-insensitive and order-preserving", () => {
    expect(dedupeStrings(["A", "a", "B"])).toEqual(["A", "B"]);
  });
});
