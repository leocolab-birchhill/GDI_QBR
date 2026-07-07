import { describe, it, expect } from "vitest";
import { generateQbrDeck, QBR_SLIDE_COUNT } from "@/lib/ppt/generateQbrDeck";
import { SlideContent } from "@/lib/ai/schemas";
import { TO_CONFIRM } from "@/lib/constants";

const sample: SlideContent = {
  title: { clientName: "McGill University", quarterYear: "Q1 2026", meetingMonthYear: "June 2026" },
  agenda: ["OPEN FOLLOW-UPS & PROGRESS", "PRIORITY ITEMS", "DASHBOARD", "WHAT'S NEXT", "QUESTIONS & DISCUSSION"],
  followUps: [{ number: 1, action: "Improve dock access", status: "In Progress", owner: "Marie", dueDate: "Jun 1, 2026" }],
  priorityItems: [{ number: 1, title: "Parking access", explanation: "Recurring difficulty accessing the loading dock." }],
  dashboard: {
    healthAndSafety: [{ label: "Injuries reported", value: "0" }],
    operational: [{ label: "Average inspection score", value: TO_CONFIRM }],
    financial: [{ label: "Outstanding invoices", value: TO_CONFIRM }],
  },
  whatsNext: [{ number: 1, title: "Window washing proposal", detail: "GDI will submit the proposal in June." }],
};

describe("deck generation", () => {
  it("creates a non-empty .pptx buffer", async () => {
    const buf = await generateQbrDeck(sample, {}, "en");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // PPTX is a zip archive — starts with PK.
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("contains at least 7 client-facing slides, and exactly 7 when within capacity", async () => {
    const buf = await generateQbrDeck(sample, {}, "en");
    const text = buf.toString("latin1");
    // The 7 core sections are always present and in order.
    for (let i = 1; i <= QBR_SLIDE_COUNT; i++) {
      expect(text).toContain(`ppt/slides/slide${i}.xml`);
    }
    // This sample is within capacity (no continuation slides) => exactly 7.
    expect(text).not.toContain("ppt/slides/slide8.xml");
    expect(QBR_SLIDE_COUNT).toBe(7);
  });

  it("never includes internal enablement slides", async () => {
    const buf = await generateQbrDeck(sample, {}, "en");
    const text = buf.toString("latin1").toLowerCase();
    expect(text).not.toContain("internal enablement");
    expect(text).not.toContain("enablement");
  });

  it("renders unknown metrics as 'To confirm'", async () => {
    const buf = await generateQbrDeck(sample, {}, "en");
    const text = buf.toString("latin1");
    expect(text).toContain(TO_CONFIRM);
  });
});

/** Distinct slide numbers referenced in the rendered .pptx, ascending. */
function slideNumbers(buf: Buffer): number[] {
  const text = buf.toString("latin1");
  const set = new Set<number>();
  const re = /ppt\/slides\/slide(\d+)\.xml/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

describe("deck overflow handling", () => {
  it("renders all 6 priority items on a single (scaled) Priority Items slide", async () => {
    const priorityItems = Array.from({ length: 6 }, (_, i) => ({
      number: i + 1,
      title: `Priority topic number ${i + 1}`,
      explanation: `Explanation for priority ${i + 1} that should still be rendered.`,
    }));
    const buf = await generateQbrDeck({ ...sample, priorityItems }, {}, "en");
    const text = buf.toString("latin1");
    // No continuation slides for prose lists — still exactly 7 slides.
    expect(slideNumbers(buf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Every item is present (nothing dropped).
    for (const p of priorityItems) {
      expect(text).toContain(p.title);
    }
  });

  it("paginates many follow-ups onto continuation slides", async () => {
    const followUps = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      action: `Agreed action ${i + 1}`,
      status: "Open",
      owner: "Marie",
      dueDate: "Jun 1, 2026",
    }));
    const buf = await generateQbrDeck({ ...sample, followUps }, {}, "en");
    const text = buf.toString("latin1");
    // More than the 7 core slides were produced.
    expect(slideNumbers(buf).length).toBeGreaterThan(7);
    // Continuation header present ("&" is XML-escaped, so match the safe part).
    expect(text).toContain("(cont.)");
  });

  it("paginates many dashboard metrics onto continuation slides", async () => {
    const operational = Array.from({ length: 30 }, (_, i) => ({
      label: `Operational metric ${i + 1}`,
      value: String(i + 1),
    }));
    const buf = await generateQbrDeck(
      {
        ...sample,
        dashboard: { ...sample.dashboard, operational },
      },
      {},
      "en",
    );
    const text = buf.toString("latin1");
    expect(slideNumbers(buf).length).toBeGreaterThan(7);
    expect(text).toContain("(cont.)");
  });
});
