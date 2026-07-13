import { describe, it, expect } from "vitest";
import { parseSlideEditFallback } from "@/lib/qbr/slideEditFallback";
import { findTargetItem } from "@/lib/qbr/service";
import { AnswerContext } from "@/lib/qbr/answer";

function ctx(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    clientName: "McGill University",
    quarter: "Q1",
    year: 2026,
    status: "VP_REVIEW",
    commitments: [{ action: "Dock access", status: "Open", owner: null }],
    priorities: [{ title: "Parking" }],
    metrics: [{ group: "Operational", label: "Average inspection score", value: "To confirm", isConfirmed: false }],
    upcomingItems: [],
    missingInfo: [],
    approvals: [],
    deckVersions: [],
    latestDeck: {
      versionNumber: 1,
      status: "draft",
      isFinal: false,
      title: null,
      generatedAt: null,
      agenda: ["OPEN FOLLOW-UPS & PROGRESS", "PRIORITY ITEMS", "DASHBOARD"],
      priorities: [],
      metrics: [],
      whatsNext: [],
    },
    recentEmails: [],
    ...overrides,
  };
}

describe("deterministic slide-edit parser", () => {
  it("parses 'Add to the dashboard: X = Y' into a set_metric op and regenerates", () => {
    const r = parseSlideEditFallback("Add to the dashboard: customer satisfaction score = 67.69/100", ctx());
    expect(r.regenerate).toBe(true);
    expect(r.operations).toHaveLength(1);
    const op = r.operations[0];
    expect(op.type).toBe("set_metric");
    expect(op.label?.toLowerCase()).toBe("customer satisfaction score");
    expect(op.value).toBe("67.69/100");
    expect(op.group).toBe("Operational");
  });

  it("parses 'set Average inspection score to 92%'", () => {
    const r = parseSlideEditFallback("set Average inspection score to 92%", ctx());
    expect(r.operations[0]).toMatchObject({ type: "set_metric", label: "Average inspection score", value: "92%" });
  });

  it("infers Financial group for invoices", () => {
    const r = parseSlideEditFallback("set outstanding invoices to 5", ctx());
    expect(r.operations[0]).toMatchObject({ type: "set_metric", group: "Financial", value: "5" });
  });

  it("parses what's-next additions", () => {
    const r = parseSlideEditFallback("add what's-next item: Window washing proposal in June", ctx());
    expect(r.operations[0]).toMatchObject({ type: "add_upcoming" });
    expect(r.operations[0].title?.toLowerCase()).toContain("window washing");
  });

  it("parses commitment status changes", () => {
    const r = parseSlideEditFallback("mark the Dock access follow-up as complete", ctx());
    expect(r.operations[0]).toMatchObject({ type: "set_commitment_status", status: "Complete" });
  });

  it("parses removals by kind", () => {
    expect(parseSlideEditFallback("remove the Parking priority", ctx()).operations[0]).toMatchObject({
      type: "remove_priority",
      title: "Parking",
    });
    expect(parseSlideEditFallback("delete the outstanding invoices metric", ctx()).operations[0]).toMatchObject({
      type: "remove_metric",
    });
  });


  it("removes agenda slide text with set_agenda instead of deleting slides", () => {
    const r = parseSlideEditFallback("delete PRIORITY ITEMS from the agenda slide", ctx());
    expect(r.operations[0]).toMatchObject({ type: "set_agenda" });
    expect(r.operations[0].detail).toContain("OPEN FOLLOW-UPS & PROGRESS");
    expect(r.operations[0].detail).not.toContain("PRIORITY ITEMS");
  });

  it("parses reword priority", () => {
    const r = parseSlideEditFallback("reword the Parking priority to focus on the loading dock", ctx());
    expect(r.operations[0]).toMatchObject({ type: "reword_priority", title: "Parking" });
    expect(r.operations[0].explanation?.toLowerCase()).toContain("loading dock");
  });

  it("applies multiple edits from one message", () => {
    const r = parseSlideEditFallback(
      "set Average inspection score to 92% and set outstanding invoices to 5",
      ctx(),
    );
    expect(r.operations).toHaveLength(2);
    expect(r.regenerate).toBe(true);
  });

  it("expands a counted comma-separated priority request into separate items", () => {
    const r = parseSlideEditFallback(
      "Add 4 priority items: priority 4, priority 5, priority 6, priority 7",
      ctx(),
    );
    expect(r.operations).toEqual([
      expect.objectContaining({ type: "add_priority", title: "priority 4" }),
      expect.objectContaining({ type: "add_priority", title: "priority 5" }),
      expect.objectContaining({ type: "add_priority", title: "priority 6" }),
      expect.objectContaining({ type: "add_priority", title: "priority 7" }),
    ]);
    expect(r.operations.every((op) => op.title !== "Add 4 priority items")).toBe(true);
  });

  it("expands newline and semicolon lists for other repeatable slide rows", () => {
    const upcoming = parseSlideEditFallback(
      "Add 3 what's-next items:\n1. Window washing\n2. Parking review\n3. Contract renewal",
      ctx(),
    );
    expect(upcoming.operations.map((op) => op.title)).toEqual([
      "Window washing",
      "Parking review",
      "Contract renewal",
    ]);

    const followUps = parseSlideEditFallback(
      "Add 3 follow-ups: Confirm dates; Send proposal; Book review",
      ctx(),
    );
    expect(followUps.operations.map((op) => op.action)).toEqual([
      "Confirm dates",
      "Send proposal",
      "Book review",
    ]);
  });

  it("expands counted dashboard metrics and custom slides", () => {
    const metrics = parseSlideEditFallback(
      "Set 3 metrics: Inspection score = 92%, Open invoices = 5, Incidents = 0",
      ctx(),
    );
    expect(metrics.operations).toEqual([
      expect.objectContaining({ type: "set_metric", label: "Inspection score", value: "92%" }),
      expect.objectContaining({ type: "set_metric", label: "Open invoices", value: "5" }),
      expect.objectContaining({ type: "set_metric", label: "Incidents", value: "0" }),
    ]);

    const slides = parseSlideEditFallback("Add 2 slides: Site notes, Renewal plan", ctx());
    expect(slides.operations).toEqual([
      expect.objectContaining({ type: "add_slide", title: "Site notes" }),
      expect.objectContaining({ type: "add_slide", title: "Renewal plan" }),
    ]);
  });

  it("does not split a single item containing a descriptive comma", () => {
    const r = parseSlideEditFallback("Add a priority: Improve parking access, loading dock side", ctx());
    expect(r.operations).toHaveLength(1);
    expect(r.operations[0]).toMatchObject({
      type: "add_priority",
      title: "Improve parking access, loading dock side",
    });
  });

  it("asks for specifics (no rebuild) when nothing parses", () => {
    const r = parseSlideEditFallback("hello there", ctx());
    expect(r.operations).toEqual([]);
    expect(r.regenerate).toBe(false);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("suggestions reference an unconfirmed metric by name", () => {
    const r = parseSlideEditFallback("hello", ctx());
    expect(r.suggestions.some((s) => s.includes("Average inspection score"))).toBe(true);
  });

  it("parses add-slide requests", () => {
    const r = parseSlideEditFallback("add a slide titled Site notes", ctx());
    expect(r.operations[0]).toMatchObject({
      type: "add_slide",
      title: "Site notes",
      kind: "prose",
      afterSection: "whatsNext",
    });
    expect(r.regenerate).toBe(true);
  });

  it("parses hide-dashboard-group requests", () => {
    const r = parseSlideEditFallback("hide the Financial dashboard section", ctx());
    expect(r.operations[0]).toMatchObject({ type: "remove_dashboard_group", group: "Financial" });
    expect(r.regenerate).toBe(true);
  });
});

describe("findTargetItem (edit-op row matching)", () => {
  // The slide shows clientReadyText, which can be a rewritten/translated
  // version of the stored action — deletes and edits must still find the row.
  const commitments = [
    { id: "c1", action: "fix dock door asap!!", clientReadyText: "Resolve the loading dock door issue." },
    { id: "c2", action: "Send updated invoice", clientReadyText: "Send updated invoice." },
  ];

  it("matches by exact row id first, even when all text differs (e.g. translated deck)", () => {
    const match = findTargetItem(commitments, "c1", ["Résoudre le problème de la porte du quai."], [
      (c) => c.action,
      (c) => c.clientReadyText,
    ]);
    expect(match?.id).toBe("c1");
  });

  it("falls back to the primary text field with normalized matching", () => {
    const match = findTargetItem(commitments, undefined, ["send updated invoice"], [
      (c) => c.action,
      (c) => c.clientReadyText,
    ]);
    expect(match?.id).toBe("c2");
  });

  it("falls back to clientReadyText when the op carries the rewritten display text", () => {
    const match = findTargetItem(commitments, undefined, ["Resolve the loading dock door issue"], [
      (c) => c.action,
      (c) => c.clientReadyText,
    ]);
    expect(match?.id).toBe("c1");
  });

  it("returns undefined when nothing matches (new/unknown item)", () => {
    const match = findTargetItem(commitments, undefined, ["Completely different action"], [
      (c) => c.action,
      (c) => c.clientReadyText,
    ]);
    expect(match).toBeUndefined();
  });

  it("ignores a stale itemId and still resolves via text", () => {
    const match = findTargetItem(commitments, "gone", ["Send updated invoice."], [
      (c) => c.action,
      (c) => c.clientReadyText,
    ]);
    expect(match?.id).toBe("c2");
  });
});
