import { describe, it, expect } from "vitest";
import {
  applyPatchToLayout,
} from "@/lib/qbr/deckPatches";
import { emptyDeckLayout } from "@/lib/qbr/deckLayout";
import {
  buildReorderItems,
  computeReorderPatches,
  moveReorderItem,
} from "@/lib/qbr/deckReorder";
import type { SlideContent } from "@/lib/ai/schemas";

describe("deck reorder", () => {
  const base: SlideContent = {
    clientName: "Acme",
    quarterYear: "Q1 2026",
    agenda: [],
    followUps: [],
    priorities: [],
    dashboard: [],
    whatsNext: [],
    customSlides: [
      {
        id: "custom-1",
        title: "Safety Update",
        kind: "prose",
        body: "Zero incidents",
        afterSection: "priorities",
      },
    ],
    hiddenSections: [],
    sectionOrder: ["agenda", "followUps", "priorities", "dashboard", "whatsNext"],
  };

  it("builds a flat list matching the resolved deck sequence", () => {
    const items = buildReorderItems(base);
    expect(items.map((item) => item.id)).toEqual([
      "title",
      "agenda",
      "followUps",
      "priorities",
      "custom-1",
      "dashboard",
      "whatsNext",
      "questions",
    ]);
  });

  it("moves items without crossing pinned slides", () => {
    const items = buildReorderItems(base);
    const moved = moveReorderItem(items, 2, -1);
    expect(moved[1].id).toBe("followUps");
    expect(moved[2].id).toBe("agenda");
    expect(moveReorderItem(items, 0, -1)).toBe(items);
    expect(moveReorderItem(items, items.length - 1, 1)).toBe(items);
  });

  it("computes section order and custom slide patches", () => {
    const items = buildReorderItems(base);
    const reordered = moveReorderItem(moveReorderItem(items, 5, -3), 4, -1);
    const patches = computeReorderPatches(base, reordered);
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({
      target: "deckLayout.sectionOrder",
      action: "set",
    });
    expect(patches[1]).toMatchObject({
      target: "deckLayout.customSlides",
      action: "set",
    });
  });
});

describe("deck metadata patches — custom slide set", () => {
  it("replaces the custom slide list", () => {
    const layout = emptyDeckLayout();
    layout.customSlides.push({
      id: "a",
      title: "First",
      kind: "prose",
      body: "",
      afterSection: "agenda",
    });
    const { change } = applyPatchToLayout(layout, {
      target: "deckLayout.customSlides",
      action: "set",
      set: {
        value: [
          {
            id: "b",
            title: "Second",
            kind: "table",
            body: "A|B\n1|2",
            afterSection: "dashboard",
          },
        ],
      },
    });
    expect(change).toContain("Reordered");
    expect(layout.customSlides).toHaveLength(1);
    expect(layout.customSlides[0].id).toBe("b");
    expect(layout.customSlides[0].kind).toBe("table");
  });
});
