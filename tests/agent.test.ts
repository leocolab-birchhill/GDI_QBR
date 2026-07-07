import { describe, it, expect } from "vitest";
import { detectAction } from "@/lib/qbr/action";
import { runQbrAgent, editSlides } from "@/lib/ai";
import { SlideEditSchema } from "@/lib/ai/schemas";
import { AnswerContext } from "@/lib/qbr/answer";

function ctx(overrides: Partial<AnswerContext> = {}): AnswerContext {
  return {
    clientName: "McGill University",
    quarter: "Q1",
    year: 2026,
    status: "COLLECTING_INPUTS",
    commitments: [{ action: "Confirm dock access", status: "Open", owner: null }],
    priorities: [{ title: "Safety" }, { title: "Contract renewal" }],
    metrics: [{ group: "Health & Safety", label: "Injuries reported", value: "0", isConfirmed: true }],
    upcomingItems: [],
    missingInfo: [
      { field: "dashboardMetrics", question: "Dashboard metrics", status: "Open" },
      { field: "nextQbrDate", question: "Proposed next QBR date", status: "Open" },
    ],
    approvals: [],
    deckVersions: [],
    recentEmails: [],
    ...overrides,
  };
}

describe("deterministic action detection", () => {
  it("detects deck generation across phrasings", () => {
    expect(detectAction("Ok, generate a deck with this information:")).toBe("generate_draft");
    expect(detectAction("please build the deck")).toBe("generate_draft");
    expect(detectAction("can you make the slides for McGill?")).toBe("generate_draft");
    expect(detectAction("generate draft")).toBe("generate_draft");
    expect(detectAction("put together a presentation")).toBe("generate_draft");
  });

  it("detects approve / revise / finalize", () => {
    expect(detectAction("Looks good, approve it")).toBe("approve");
    expect(detectAction("please revise the parking section")).toBe("revise");
    expect(detectAction("finalize the deck")).toBe("finalize");
  });

  it("returns none for a plain question", () => {
    expect(detectAction("what else do you need from me?")).toBe("none");
    expect(detectAction("who owns the outstanding items?")).toBe("none");
  });
});

describe("runQbrAgent (offline fallback)", () => {
  it("flags generate_draft when the user asks for a deck — even with data in the body", async () => {
    const message =
      "Ok, generate a deck with this information:\n1. Open Follow-Ups\n- Status of: Adhoc\n3. Dashboard\n- Average inspection score: 9/10";
    const res = await runQbrAgent({ message, context: ctx(), capturedChanges: ["Operational: Average inspection score = 9/10"] });
    expect(res.action).toBe("generate_draft");
    expect(typeof res.reply).toBe("string");
  });

  it("does not flag an action for a plain question and answers conversationally", async () => {
    const res = await runQbrAgent({
      message: "What else do you need from me for the McGill deck this quarter?",
      context: ctx(),
    });
    expect(res.action).toBe("none");
    expect(res.reply.toLowerCase()).toMatch(/need|dashboard|next/);
  });
});

describe("editSlides (offline fallback)", () => {
  it("parses a concrete instruction into an edit op and regenerates, even with no model", async () => {
    const res = await editSlides({ message: "set Average inspection score to 92%", context: ctx() });
    const parsed = SlideEditSchema.safeParse(res);
    expect(parsed.success).toBe(true);
    expect(res.regenerate).toBe(true);
    expect(res.operations[0]).toMatchObject({ type: "set_metric", value: "92%" });
  });

  it("asks for specifics (no rebuild) when the instruction is vague", async () => {
    const res = await editSlides({ message: "update a dashboard metric value", context: ctx() });
    expect(res.operations).toEqual([]);
    expect(res.regenerate).toBe(false);
    expect(res.suggestions.length).toBeGreaterThan(0);
  });
});
