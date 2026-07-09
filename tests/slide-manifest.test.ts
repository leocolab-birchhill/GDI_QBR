import { describe, it, expect } from "vitest";
import { generateQbrDeck } from "@/lib/ppt/generateQbrDeck";
import { buildDeckManifest, changedSectionsForOps } from "@/lib/ppt/slideManifest";
import type { SlideContent } from "@/lib/ai/schemas";
import { TO_CONFIRM } from "@/lib/constants";

const base: SlideContent = {
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

/** Count distinct slide numbers in the rendered .pptx. */
function renderedSlideCount(buf: Buffer): number {
  const text = buf.toString("latin1");
  const set = new Set<number>();
  const re = /ppt\/slides\/slide(\d+)\.xml/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(Number(m[1]));
  return set.size;
}

describe("slide manifest matches the renderer", () => {
  it("produces the same slide count as the rendered deck (normal)", async () => {
    const buf = await generateQbrDeck(base);
    expect(buildDeckManifest(base).length).toBe(renderedSlideCount(buf));
  });

  it("matches slide count with overflowing follow-ups", async () => {
    const followUps = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      action: `Action ${i + 1}`,
      status: "Open",
      owner: "Marie",
      dueDate: "Jun 1, 2026",
    }));
    const content = { ...base, followUps };
    const buf = await generateQbrDeck(content);
    const manifest = buildDeckManifest(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
    // Continuation slides exist and reuse the follow-ups section.
    expect(manifest.filter((s) => s.section === "followUps").length).toBeGreaterThan(1);
    expect(manifest.some((s) => s.section === "followUps" && s.continuation)).toBe(true);
  });

  it("matches slide count with overflowing dashboard metrics", async () => {
    const operational = Array.from({ length: 30 }, (_, i) => ({ label: `Metric ${i + 1}`, value: String(i + 1) }));
    const content = { ...base, dashboard: { ...base.dashboard, operational } };
    const buf = await generateQbrDeck(content);
    const manifest = buildDeckManifest(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
    expect(manifest.filter((s) => s.section === "dashboard").length).toBeGreaterThan(1);
  });

  it("matches slide count with an overflowing agenda and adds continuation slides", async () => {
    const agenda = Array.from({ length: 20 }, (_, i) => `Agenda section ${i + 1}`);
    const content = { ...base, agenda };
    const buf = await generateQbrDeck(content);
    const manifest = buildDeckManifest(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
    const agendaSlides = manifest.filter((s) => s.section === "agenda");
    expect(agendaSlides.length).toBeGreaterThan(1);
    expect(agendaSlides.some((s) => s.continuation)).toBe(true);
    // Numbering runs continuously across continuation slides.
    if (agendaSlides[0].kind === "agenda") expect(agendaSlides[0].items[0].number).toBe(1);
  });

  it("matches slide count with overflowing priorities and what's next", async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, title: `Item ${i + 1}`, explanation: `Detail ${i + 1}` }));
    const content = {
      ...base,
      priorityItems: many(20),
      whatsNext: Array.from({ length: 20 }, (_, i) => ({ number: i + 1, title: `Next ${i + 1}`, detail: `Detail ${i + 1}` })),
    };
    const buf = await generateQbrDeck(content);
    const manifest = buildDeckManifest(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
    expect(manifest.filter((s) => s.section === "priorities").length).toBeGreaterThan(1);
    expect(manifest.filter((s) => s.section === "whatsNext").length).toBeGreaterThan(1);
  });

  it("keeps all 6 priority items on a single Priority Items slide", () => {
    const priorityItems = Array.from({ length: 6 }, (_, i) => ({
      number: i + 1,
      title: `Priority ${i + 1}`,
      explanation: `Detail ${i + 1}`,
    }));
    const manifest = buildDeckManifest({ ...base, priorityItems });
    const prioritySlides = manifest.filter((s) => s.section === "priorities");
    expect(prioritySlides.length).toBe(1);
    const slide = prioritySlides[0];
    expect(slide.kind).toBe("prose");
    if (slide.kind === "prose") expect(slide.items.length).toBe(6);
  });

  it("agenda numbering starts at 1", () => {
    const manifest = buildDeckManifest(base);
    const agenda = manifest.find((s) => s.section === "agenda");
    expect(agenda?.kind).toBe("agenda");
    if (agenda?.kind === "agenda") expect(agenda.items[0].number).toBe(1);
  });

  it("maps edit ops to the affected sections", () => {
    expect(changedSectionsForOps(["set_metric"])).toEqual(["dashboard"]);
    expect(changedSectionsForOps(["add_priority", "reword_priority"])).toEqual(["priorities"]);
    expect(changedSectionsForOps(["add_commitment"])).toEqual(["followUps"]);
    expect(changedSectionsForOps(["add_slide", "set_section_hidden"])).toEqual(["agenda"]);
    expect(changedSectionsForOps(["remove_dashboard_group"])).toEqual(["dashboard"]);
    // Deck-wide format ops affect every slide → no specific scroll target.
    expect(changedSectionsForOps(["set_footer", "set_page_numbers"])).toEqual([]);
  });

  it("omits hidden sections from the manifest", async () => {
    const content = { ...base, hiddenSections: ["agenda", "questions"] };
    const manifest = buildDeckManifest(content);
    expect(manifest.some((s) => s.section === "agenda")).toBe(false);
    expect(manifest.some((s) => s.section === "questions")).toBe(false);
    const buf = await generateQbrDeck(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
  });

  it("includes custom slides after their anchor section", async () => {
    const content = {
      ...base,
      customSlides: [
        {
          id: "custom-1",
          title: "Site notes",
          kind: "prose" as const,
          body: "Lobby refresh: paint scheduled for July",
          afterSection: "dashboard",
        },
      ],
    };
    const manifest = buildDeckManifest(content);
    const dashIdx = manifest.findIndex((s) => s.section === "dashboard" && !s.continuation);
    const customIdx = manifest.findIndex((s) => "customId" in s && s.customId === "custom-1");
    expect(customIdx).toBeGreaterThan(dashIdx);
    const buf = await generateQbrDeck(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
  });

  it("skips hidden dashboard groups", async () => {
    const content = {
      ...base,
      dashboard: {
        ...base.dashboard,
        hiddenGroups: ["Financial"],
      },
    };
    const manifest = buildDeckManifest(content);
    const dash = manifest.filter((s) => s.section === "dashboard" && s.kind === "dashboard");
    expect(dash.length).toBeGreaterThan(0);
    for (const slide of dash) {
      if (slide.kind !== "dashboard") continue;
      for (const col of slide.columns) {
        expect(col.title.toLowerCase()).not.toContain("financial");
      }
    }
    const buf = await generateQbrDeck(content);
    expect(manifest.length).toBe(renderedSlideCount(buf));
  });

  it("respects a custom section order", () => {
    const content = { ...base, sectionOrder: ["dashboard", "agenda", "followUps", "priorities", "whatsNext"] };
    const manifest = buildDeckManifest(content);
    const firstContent = manifest.find((s) => s.section !== "title");
    expect(firstContent?.section).toBe("dashboard");
  });
});
