import { describe, expect, it } from "vitest";
import { buildSlideEditPrompt } from "@/lib/ai";
import type { EditorContext } from "@/lib/qbr/editorContext";

function editorContext(overrides: Partial<EditorContext> = {}): EditorContext {
  return {
    clientName: "McGill University",
    quarter: "Q1",
    year: 2026,
    status: "VP_REVIEW",
    meetingDate: null,
    nextMeetingDate: null,
    previousQbrNotes: null,
    commitments: [],
    priorities: [{ id: "p1", title: "Parking", explanation: "Resolve loading dock congestion", sortOrder: 1 }],
    metrics: [{ group: "Operational", label: "Average inspection score", value: "To confirm", isConfirmed: false }],
    upcomingItems: [{ id: "u1", title: "Contract renewal", detail: "Prepare renewal plan", sortOrder: 1 }],
    missingInfo: [],
    approvals: [],
    deckVersions: [],
    latestDeck: null,
    recentEmails: [],
    deckLayout: {
      customSlides: [],
      hiddenSections: [],
      sectionOrder: [],
      hiddenDashboardGroups: [],
      extraDashboardGroups: [],
    },
    deckOptions: {},
    requestContext: undefined,
    slides: {
      customSlides: [],
      hiddenSections: [],
      sectionOrder: [],
      hiddenDashboardGroups: [],
      extraDashboardGroups: [],
    },
    ...overrides,
  };
}

describe("slide edit prompt context", () => {
  it("adds guided-answer instructions and task metadata without changing the user text", () => {
    const guidedTask = {
      id: "priorities-input",
      section: "priorities",
      question: "What are the 2–3 priorities to discuss?",
      rationale: "A short list keeps the conversation focused on decisions.",
      fields: [{ key: "priorityItems", label: "Priority items", inputType: "prose", required: true }],
      priority: 1,
      complete: false,
    };

    const prompt = buildSlideEditPrompt({
      message: "Add another priority. Talk with Sarah.",
      context: editorContext({ requestContext: { inputSource: "guided_answer", activeSection: "priorities", guidedTask } }),
      activeSection: "priorities",
      inputSource: "guided_answer",
      guidedTask,
    });

    expect(prompt.system).toContain("GUIDED ANSWER MODE");
    expect(prompt.system).toContain("Answer in your own words");
    expect(prompt.system).toContain("What are the 2–3 priorities to discuss?");
    expect(prompt.system).toContain("Do not store generic UI/action phrases");
    expect(prompt.user).toContain("Add another priority. Talk with Sarah.");
  });

  it("marks activity chat submissions separately while still including row-level context", () => {
    const prompt = buildSlideEditPrompt({
      message: "Make this slide shorter",
      context: editorContext({ requestContext: { inputSource: "activity_chat", activeSection: "priorities" } }),
      activeSection: "priorities",
      inputSource: "activity_chat",
    });

    expect(prompt.system).toContain("ACTIVITY CHAT MODE");
    expect(prompt.user).toContain('"id": "p1"');
    expect(prompt.user).toContain('"explanation": "Resolve loading dock congestion"');
  });
});
