import { describe, it, expect } from "vitest";
import {
  cleanText,
  toHeadline,
  toSentence,
  toLabel,
  toValue,
  normalizeSlideContent,
} from "@/lib/ppt/textNormalize";
import type { SlideContent } from "@/lib/ai/schemas";
import { TO_CONFIRM } from "@/lib/constants";

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  hello   world  ")).toBe("hello world");
  });
  it("removes spaces before punctuation and normalizes spacing after", () => {
    expect(cleanText("done .Next item ,here")).toBe("done. Next item, here");
  });
  it("tidies bracket spacing and repeated punctuation", () => {
    expect(cleanText("review ( Q1 ) done..")).toBe("review (Q1) done.");
  });
});

describe("toHeadline", () => {
  it("capitalizes the first letter and drops a trailing period", () => {
    expect(toHeadline("parking access.")).toBe("Parking access");
  });
  it("leaves proper-noun casing intact", () => {
    expect(toHeadline("GDI window washing")).toBe("GDI window washing");
  });
  it("keeps question marks", () => {
    expect(toHeadline("renewal next quarter?")).toBe("Renewal next quarter?");
  });
});

describe("toSentence", () => {
  it("capitalizes and adds a terminal period", () => {
    expect(toSentence("recurring dock access issues")).toBe("Recurring dock access issues.");
  });
  it("does not double-punctuate", () => {
    expect(toSentence("Already a sentence.")).toBe("Already a sentence.");
  });
});

describe("toLabel / toValue", () => {
  it("capitalizes status labels", () => {
    expect(toLabel("in progress")).toBe("In progress");
  });
  it("preserves values, numbers, and the To confirm sentinel", () => {
    expect(toValue("92%")).toBe("92%");
    expect(toValue(`  ${TO_CONFIRM}  `)).toBe(TO_CONFIRM);
    expect(toValue("Marie")).toBe("Marie");
  });
});

describe("normalizeSlideContent", () => {
  const messy: SlideContent = {
    title: { clientName: "  McGill   University ", quarterYear: "Q1 2026", meetingMonthYear: "June 2026" },
    agenda: ["OPEN FOLLOW-UPS & PROGRESS"],
    followUps: [{ number: 1, action: "improve dock access", status: "open", owner: "Marie", dueDate: "Jun 1, 2026" }],
    priorityItems: [{ number: 1, title: "parking access.", explanation: "recurring difficulty at the dock" }],
    dashboard: {
      healthAndSafety: [{ label: "injuries reported", value: "0" }],
      operational: [{ label: "inspection score", value: TO_CONFIRM }],
      financial: [{ label: "outstanding invoices", value: "$1,200" }],
    },
    whatsNext: [{ number: 1, title: "window washing proposal", detail: "gdi will submit in june" }],
  };

  it("normalizes casing, spacing, and terminal punctuation across sections", () => {
    const n = normalizeSlideContent(messy);
    expect(n.title.clientName).toBe("McGill University");
    expect(n.followUps[0].action).toBe("Improve dock access.");
    expect(n.followUps[0].status).toBe("Open");
    expect(n.priorityItems[0].title).toBe("Parking access");
    expect(n.priorityItems[0].explanation).toBe("Recurring difficulty at the dock.");
    expect(n.dashboard.financial[0].value).toBe("$1,200");
    expect(n.dashboard.operational[0].value).toBe(TO_CONFIRM);
    expect(n.whatsNext[0].title).toBe("Window washing proposal");
    expect(n.whatsNext[0].detail).toBe("Gdi will submit in june.");
  });

  it("leaves agenda navigation labels uppercased (only trims)", () => {
    const n = normalizeSlideContent({ ...messy, agenda: ["  PRIORITY ITEMS  "] });
    expect(n.agenda[0]).toBe("PRIORITY ITEMS");
  });

  it("is idempotent", () => {
    const once = normalizeSlideContent(messy);
    const twice = normalizeSlideContent(once);
    expect(twice).toEqual(once);
  });
});
