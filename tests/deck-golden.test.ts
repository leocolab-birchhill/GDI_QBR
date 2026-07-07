import { describe, it, expect } from "vitest";
import { generateQbrDeck, QBR_SLIDE_COUNT, type DeckOptions } from "@/lib/ppt/generateQbrDeck";
import type { SlideContent } from "@/lib/ai/schemas";
import { TO_CONFIRM } from "@/lib/constants";

/**
 * Structural golden test. Renders a fixed SlideContent + DeckOptions and asserts
 * stable structural invariants (slide count, section titles, key labels, overlay
 * presence) rather than raw .pptx bytes. Accidental formatting drift that adds /
 * drops slides, sections, or overlays will fail here.
 */

const fixture: SlideContent = {
  title: { clientName: "McGill University", quarterYear: "Q1 2026", meetingMonthYear: "June 2026" },
  agenda: ["OPEN FOLLOW-UPS & PROGRESS", "PRIORITY ITEMS", "DASHBOARD", "WHAT'S NEXT", "QUESTIONS & DISCUSSION"],
  followUps: [
    { number: 1, action: "Improve dock access", status: "In Progress", owner: "Marie", dueDate: "Jun 1, 2026" },
    { number: 2, action: "Update safety signage", status: "Open", owner: "Luc", dueDate: "Jul 15, 2026" },
  ],
  priorityItems: [
    { number: 1, title: "Parking access", explanation: "Recurring difficulty accessing the loading dock." },
    { number: 2, title: "Night cleaning window", explanation: "Adjust schedule to reduce tenant disruption." },
  ],
  dashboard: {
    healthAndSafety: [{ label: "Injuries reported", value: "0" }],
    operational: [{ label: "Average inspection score", value: "92%" }],
    financial: [{ label: "Outstanding invoices", value: TO_CONFIRM }],
  },
  whatsNext: [{ number: 1, title: "Window washing proposal", detail: "GDI will submit the proposal in June." }],
};

const options: DeckOptions = {
  pageNumbers: true,
  pageNumberPosition: "bottom-both",
  footerText: "Confidential - GDI",
  titleTag: "67",
};

function slideNumbers(buf: Buffer): number[] {
  const text = buf.toString("latin1");
  const set = new Set<number>();
  const re = /ppt\/slides\/slide(\d+)\.xml/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

describe("deck golden (structural)", () => {
  it("renders the expected structural facts for a within-capacity deck", async () => {
    const buf = await generateQbrDeck(fixture, options, "en");
    const text = buf.toString("latin1");

    // Exactly the 7 core slides — no continuation, no dropped sections.
    expect(slideNumbers(buf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(QBR_SLIDE_COUNT).toBe(7);

    // The set of section titles is present. ("&" and "'" are XML-escaped in the
    // slide markup, so we match special-char-free substrings.)
    const sectionTitles = [
      "AGENDA",
      "OPEN FOLLOW-UPS",
      "PRIORITY ITEMS",
      "DASHBOARD",
      "NEXT",
      "QUESTIONS",
    ];
    for (const titleText of sectionTitles) {
      expect(text).toContain(titleText);
    }

    // Key content labels are present.
    expect(text).toContain("McGill University");
    expect(text).toContain("Quarterly Business Review");
    expect(text).toContain("Parking access");
    expect(text).toContain("Window washing proposal");
    expect(text).toContain("Injuries reported");
    expect(text).toContain(TO_CONFIRM);

    // Overlays render: footer text + corner tag.
    expect(text).toContain("Confidential - GDI");
    expect(text).toContain("67");
  });
});
