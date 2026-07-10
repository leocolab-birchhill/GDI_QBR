import { describe, expect, it } from "vitest";
import type { SlideContent } from "@/lib/ai/schemas";
import { getSectionReview } from "@/lib/qbr/sectionGuidance";

const content: SlideContent = {
  title: { clientName: "Acme", quarterYear: "Q3 2026", meetingMonthYear: "July 2026" },
  agenda: ["Follow-ups", "Priorities"],
  followUps: [{ number: 1, action: "Confirm access", status: "Open", owner: "To confirm", dueDate: "To confirm" }],
  priorityItems: [
    { number: 1, title: "Quality", explanation: "Improve inspection consistency" },
    { number: 2, title: "Staffing", explanation: "Stabilize weekend coverage" },
  ],
  dashboard: {
    healthAndSafety: [{ label: "Incidents", value: "0" }],
    operational: [{ label: "Inspection score", value: "To confirm" }],
    financial: [],
  },
  whatsNext: [{ number: 1, title: "Site review", detail: "August 12" }],
};

const progress = { currentSection: "followUps" as const, confirmedSections: [], guidedMode: true };

describe("agent interview guidance", () => {
  it("selects a deterministic task for unconfirmed follow-up fields", () => {
    const review = getSectionReview("followUps", content, progress, "en");
    expect(review.status).toBe("needs_input");
    expect(review.unconfirmed).toEqual(expect.arrayContaining([
      expect.stringContaining("Owner"),
      expect.stringContaining("Due date"),
    ]));
    expect(review.nextTask?.fields[0]).toMatchObject({ key: "followUps", required: true });
  });

  it("marks complete content ready, but only marks it complete after confirmation", () => {
    const ready = getSectionReview("priorities", content, { ...progress, currentSection: "priorities" }, "en");
    expect(ready.status).toBe("ready");
    expect(ready.nextTask?.complete).toBe(true);

    const complete = getSectionReview(
      "priorities",
      content,
      { ...progress, currentSection: "priorities", confirmedSections: ["priorities"] },
      "en",
    );
    expect(complete.status).toBe("complete");
    expect(complete.nextTask).toBeNull();
  });

  it("warns when a slide is likely too dense", () => {
    const dense = {
      ...content,
      priorityItems: [...content.priorityItems, { number: 3, title: "A", explanation: "A" }, { number: 4, title: "B", explanation: "B" }],
    };
    expect(getSectionReview("priorities", dense, progress, "en").warnings).not.toHaveLength(0);
  });
});
