import { describe, it, expect } from "vitest";
import { localizeSlideContentForLocale, localizeCommitmentStatus, localizeMetricLabel } from "@/lib/i18n/deckContent";
import type { SlideContent } from "@/lib/ai/schemas";

const sample: SlideContent = {
  title: { clientName: "McGill", quarterYear: "Q1 2026", meetingMonthYear: "June 2026" },
  agenda: ["OPEN FOLLOW-UPS & PROGRESS"],
  followUps: [
    {
      number: 1,
      action: "GDI is coordinating with the property manager.",
      status: "In Progress",
      owner: "Marie",
      dueDate: "To confirm",
    },
  ],
  priorityItems: [],
  dashboard: {
    healthAndSafety: [{ label: "Injuries reported", value: "0" }],
    operational: [{ label: "Average inspection score", value: "To confirm" }],
    financial: [],
  },
  whatsNext: [],
};

describe("deckContent localization", () => {
  it("localizes commitment statuses and metric labels to French", () => {
    expect(localizeCommitmentStatus("In Progress", "fr")).toBe("En cours");
    expect(localizeMetricLabel("Injuries reported", "fr")).toBe("Blessures signalées");
    const fr = localizeSlideContentForLocale(sample, "fr");
    expect(fr.followUps[0].status).toBe("En cours");
    expect(fr.followUps[0].dueDate).toBe("À confirmer");
    expect(fr.dashboard.healthAndSafety[0].label).toBe("Blessures signalées");
    expect(fr.dashboard.operational[0].value).toBe("À confirmer");
  });

  it("localizes back to English", () => {
    const fr = localizeSlideContentForLocale(sample, "fr");
    const en = localizeSlideContentForLocale(fr, "en");
    expect(en.followUps[0].status).toBe("In Progress");
    expect(en.dashboard.healthAndSafety[0].label).toBe("Injuries reported");
  });
});
