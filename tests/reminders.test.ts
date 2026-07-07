import { describe, it, expect } from "vitest";
import * as tpl from "@/lib/email/templates";

describe("reminder & email generation", () => {
  it("monthly check-in includes the five standard questions", () => {
    const c = tpl.monthlyCheckIn({ clientName: "McGill University" });
    expect(c.subject).toContain("McGill University");
    expect(c.text).toMatch(/client concerns/i);
    expect(c.text).toMatch(/safety incidents/i);
    expect(c.text).toMatch(/billing issues/i);
  });

  it("create confirmation lists the missing items", () => {
    const c = tpl.createQbrConfirmation({
      clientName: "McGill University",
      quarter: "Q1",
      year: 2026,
      missing: ["Previous follow-up statuses", "2-3 priority items"],
    });
    expect(c.text).toContain("Created: McGill University Q1 2026 QBR");
    expect(c.text).toContain("Previous follow-up statuses");
  });

  it("draft-ready email asks for APPROVE/REVISE/FINALIZE", () => {
    const c = tpl.draftReady({ fileName: "McGill_Q1_2026_QBR_Draft_v1.pptx", unconfirmed: ["Outstanding invoices"] });
    expect(c.text).toContain("McGill_Q1_2026_QBR_Draft_v1.pptx");
    expect(c.text).toMatch(/APPROVE, REVISE, or FINALIZE/);
    expect(c.text).toContain("Outstanding invoices");
  });

  it("VP summary email carries the summary text", () => {
    const c = tpl.vpSummary({ clientName: "McGill University", quarter: "Q1", summary: "Status: COLLECTING_INPUTS" });
    expect(c.subject).toMatch(/one-month preparation summary/);
    expect(c.text).toContain("COLLECTING_INPUTS");
  });
});
