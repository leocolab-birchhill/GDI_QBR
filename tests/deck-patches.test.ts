import { describe, it, expect } from "vitest";
import {
  applyPatchToLayout,
  applyPatchToDeckOptions,
  changedSectionsForPatches,
} from "@/lib/qbr/deckPatches";
import { emptyDeckLayout } from "@/lib/qbr/deckLayout";

describe("deck metadata patches", () => {
  it("adds a custom prose slide", () => {
    const layout = emptyDeckLayout();
    const { change, section } = applyPatchToLayout(layout, {
      target: "deckLayout.customSlides",
      action: "add",
      set: { title: "Safety Update", kind: "prose", body: "• Zero incidents", afterSection: "priorities" },
    });
    expect(change).toContain("Safety Update");
    expect(section).toBe("priorities");
    expect(layout.customSlides).toHaveLength(1);
    expect(layout.customSlides[0].kind).toBe("prose");
  });

  it("converts a custom slide from prose to table", () => {
    const layout = emptyDeckLayout();
    layout.customSlides.push({
      id: "slide-test-1",
      title: "Metrics",
      kind: "prose",
      body: "Score: 92%\nIncidents: 0",
      afterSection: "dashboard",
    });
    const { change } = applyPatchToLayout(layout, {
      target: "deckLayout.customSlides",
      action: "update",
      match: { id: "slide-test-1" },
      set: {
        kind: "table",
        body: "Metric|Value\nScore|92%\nIncidents|0",
      },
    });
    expect(change).toContain("table");
    expect(layout.customSlides[0].kind).toBe("table");
    expect(layout.customSlides[0].body).toContain("Metric|Value");
  });

  it("updates a custom slide matched by title", () => {
    const layout = emptyDeckLayout();
    layout.customSlides.push({
      id: "slide-x",
      title: "Notes",
      kind: "prose",
      body: "Old",
      afterSection: "whatsNext",
    });
    applyPatchToLayout(layout, {
      target: "deckLayout.customSlides",
      action: "update",
      match: { title: "notes" },
      set: { body: "New content" },
    });
    expect(layout.customSlides[0].body).toBe("New content");
  });

  it("removes a custom slide by title", () => {
    const layout = emptyDeckLayout();
    layout.customSlides.push({
      id: "slide-x",
      title: "Draft",
      kind: "prose",
      body: "",
      afterSection: "whatsNext",
    });
    const { change } = applyPatchToLayout(layout, {
      target: "deckLayout.customSlides",
      action: "remove",
      match: { title: "Draft" },
    });
    expect(change).toContain("Removed");
    expect(layout.customSlides).toHaveLength(0);
  });

  it("hides and restores a built-in section", () => {
    const layout = emptyDeckLayout();
    applyPatchToLayout(layout, {
      target: "deckLayout.hiddenSections",
      action: "add",
      set: { section: "dashboard" },
    });
    expect(layout.hiddenSections).toContain("dashboard");
    applyPatchToLayout(layout, {
      target: "deckLayout.hiddenSections",
      action: "remove",
      set: { section: "dashboard" },
    });
    expect(layout.hiddenSections).not.toContain("dashboard");
  });

  it("merges deckOptions for page numbers and footer", () => {
    const { options, change } = applyPatchToDeckOptions(
      {},
      {
        target: "deckOptions",
        action: "set",
        set: { pageNumbers: "bottom-left", footerText: "Confidential" },
      },
    );
    expect(change).toBeTruthy();
    expect(options.pageNumbers).toBe(true);
    expect(options.pageNumberPosition).toBe("bottom-left");
    expect(options.footerText).toBe("Confidential");
  });

  it("maps patch targets to preview sections", () => {
    const sections = changedSectionsForPatches([
      {
        target: "deckLayout.customSlides",
        action: "update",
        match: { title: "X" },
        set: { afterSection: "priorities" },
      },
      { target: "deckLayout.hiddenDashboardGroups", action: "add", set: { group: "Financial" } },
    ]);
    expect(sections).toContain("priorities");
    expect(sections).toContain("dashboard");
  });
});
