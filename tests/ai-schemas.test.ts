import { describe, it, expect } from "vitest";
import { IntentSchema, ExtractionSchema } from "@/lib/ai/schemas";
import {
  fallbackClassify,
  fallbackExtract,
  fallbackMissingInfoQuestions,
  fallbackRewrite,
} from "@/lib/ai/fallbacks";
import { TO_CONFIRM } from "@/lib/constants";

describe("intent classification schema validation", () => {
  it("validates a good intent result", () => {
    const r = IntentSchema.safeParse({ intent: "CREATE_QBR", confidence: 0.9 });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown intent value", () => {
    const r = IntentSchema.safeParse({ intent: "NOT_A_REAL_INTENT", confidence: 0.5 });
    expect(r.success).toBe(false);
  });

  it("heuristic classifier detects CREATE_QBR and FINALIZE_DRAFT", () => {
    expect(fallbackClassify({ subject: "Start QBR - X - Q1 2026", body: "" }).intent).toBe("CREATE_QBR");
    expect(fallbackClassify({ subject: "Re: deck", body: "FINALIZE" }).intent).toBe("FINALIZE_DRAFT");
  });
});

describe("extraction schema validation", () => {
  it("applies defaults for a sparse object", () => {
    const r = ExtractionSchema.parse({ intent: "UPDATE_QBR" });
    expect(r.commitments).toEqual([]);
    expect(r.approvalAction).toBe("none");
  });

  it("fallback extraction pulls client/quarter/year from the start email", () => {
    const ex = fallbackExtract({
      subject: "Start QBR - McGill University - Q1 2026",
      body: "Client: McGill University\nQuarter: Q1 2026",
    });
    const parsed = ExtractionSchema.safeParse(ex);
    expect(parsed.success).toBe(true);
    expect(ex.clientName).toMatch(/McGill/);
    expect(ex.quarter).toBe("Q1");
    expect(ex.year).toBe(2026);
  });

  it("fallback extraction captures injuries=0 as a confirmed Health & Safety metric", () => {
    const ex = fallbackExtract({ subject: "update", body: "No injuries this quarter." });
    const injury = ex.metrics.find((m) => /injur/i.test(m.label));
    expect(injury?.value).toBe("0");
  });
});

describe("missing-info generation", () => {
  it("omits known fields", () => {
    const q = fallbackMissingInfoQuestions(["priorityItems", "dashboardMetrics"]);
    const fields = q.questions.map((x) => x.field);
    expect(fields).not.toContain("priorityItems");
    expect(fields).toContain("nextQbrDate");
  });
});

describe("client-safe rewriting", () => {
  it("removes blame language and flags sensitive content", () => {
    const r = fallbackRewrite("The client is mad because our team keeps missing PPE.");
    expect(r.removedSensitiveContent).toBe(true);
    expect(r.clientReadyText.toLowerCase()).not.toContain("mad");
  });

  it("does not invent values; preserves unknown markers", () => {
    const r = fallbackRewrite(`Inspection score ${TO_CONFIRM}`);
    expect(r.clientReadyText).toContain(TO_CONFIRM);
  });
});
