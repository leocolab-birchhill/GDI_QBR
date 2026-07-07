import { describe, it, expect } from "vitest";
import { parseSlideEditFallback } from "@/lib/qbr/slideEditFallback";
import { generateQbrDeck } from "@/lib/ppt/generateQbrDeck";
import type { AnswerContext } from "@/lib/qbr/answer";
import type { SlideContent } from "@/lib/ai/schemas";

const ctx: AnswerContext = {
  clientName: "McGill",
  quarter: "Q1",
  year: 2026,
  status: "DRAFT_GENERATED",
  commitments: [],
  priorities: [],
  metrics: [],
  upcomingItems: [],
  missingInfo: [],
  approvals: [],
  deckVersions: [],
  recentEmails: [],
};

describe("live editor never refuses format requests", () => {
  it("maps page-number requests", () => {
    const r = parseSlideEditFallback("add page numbers in both the top and botto corners", ctx);
    expect(r.operations[0]).toMatchObject({ type: "set_page_numbers", value: "bottom-both" });
    expect(r.regenerate).toBe(true);
  });

  it("maps 'add the number 67 to each slide' to a title tag", () => {
    const r = parseSlideEditFallback("Add the number 67 to each slide in the title section", ctx);
    expect(r.operations[0]).toMatchObject({ type: "set_title_tag", value: "67" });
  });

  it("maps a footer request", () => {
    const r = parseSlideEditFallback("add a footer that reads Confidential - GDI", ctx);
    expect(r.operations[0]).toMatchObject({ type: "set_footer" });
    expect((r.operations[0] as any).value).toMatch(/Confidential/);
  });

  it("turns page numbers off", () => {
    const r = parseSlideEditFallback("remove page numbers", ctx);
    expect(r.operations[0]).toMatchObject({ type: "set_page_numbers", value: "off" });
  });

  it("maps a watermark-on-every-slide request to a tag", () => {
    const r = parseSlideEditFallback("put a Draft watermark on every slide", ctx);
    expect(r.operations[0]).toMatchObject({ type: "set_title_tag" });
  });
});

describe("renderer honors deck options", () => {
  const content: SlideContent = {
    title: { clientName: "McGill", quarterYear: "Q1 2026", meetingMonthYear: "June 2026" },
    agenda: ["A", "B"],
    followUps: [],
    priorityItems: [],
    dashboard: { healthAndSafety: [], operational: [], financial: [] },
    whatsNext: [],
  };

  it("renders a deck with page numbers + footer + tag without error", async () => {
    const buf = await generateQbrDeck(content, {
      pageNumbers: true,
      pageNumberPosition: "bottom-both",
      footerText: "Confidential",
      titleTag: "67",
    });
    expect(buf.length).toBeGreaterThan(1000);
  });
});
