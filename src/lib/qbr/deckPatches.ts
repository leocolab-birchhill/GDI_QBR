/**
 * Apply validated deck-metadata patches from the slide editor agent.
 *
 * Patches edit layout JSON (custom slides, section visibility/order) and deck
 * options directly — preferred over discrete ops for format/structure changes.
 */

import type { DeckPatch } from "../ai/schemas";
import { GUIDED_SECTIONS, type GuidedSection } from "../i18n";
import { prisma } from "../db";
import { audit } from "../audit";
import {
  readDeckLayout,
  serializeDeckLayout,
  findCustomSlide,
  newCustomSlideId,
  matchStandardGroup,
  HIDEABLE_SECTIONS,
  MOVABLE_SECTIONS,
  type DeckLayout,
} from "./deckLayout";
import { readDeckOptions } from "./service";

export interface PatchApplyOutcome {
  changes: string[];
  /** Section keys touched (for preview auto-scroll). */
  affectedSections: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolveSectionRef(ref?: string | null): GuidedSection | null {
  if (!ref) return null;
  const s = ref.trim().toLowerCase().replace(/\s+slide$/, "").trim();
  if ((GUIDED_SECTIONS as readonly string[]).includes(s)) return s as GuidedSection;
  if (/agenda|ordre du jour/.test(s)) return "agenda";
  if (/follow|commit|engagement|suivi/.test(s)) return "followUps";
  if (/priorit/.test(s)) return "priorities";
  if (/dashboard|tableau de bord|metric/.test(s)) return "dashboard";
  if (/next|upcoming|prochaine/.test(s)) return "whatsNext";
  if (/question|discussion|closing|clôture/.test(s)) return "questions";
  if (/^title$|^titre$/.test(s)) return "title";
  return null;
}

function validAfterSection(raw?: string | null): string {
  const s = str(raw);
  return (GUIDED_SECTIONS as readonly string[]).includes(s) ? s : "whatsNext";
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
}

/** Pure: apply one patch to an in-memory layout. Returns change description or null. */
export function applyPatchToLayout(
  layout: DeckLayout,
  patch: DeckPatch,
): { change: string | null; section: string | null } {
  const action = patch.action ?? inferDefaultAction(patch);
  const set = patch.set ?? {};

  switch (patch.target) {
    case "deckLayout.customSlides": {
      if (action === "add") {
        const title = str(set.title);
        if (!title) return { change: null, section: null };
        const kind = set.kind === "table" ? "table" : "prose";
        const body = str(set.body);
        const afterSection = validAfterSection(str(set.afterSection));
        layout.customSlides.push({
          id: newCustomSlideId(),
          title,
          kind,
          body,
          afterSection,
        });
        return {
          change: `Added a new ${kind} slide "${title}"`,
          section: afterSection,
        };
      }
      if (action === "remove") {
        const match = findCustomSlide(layout, {
          slideId: patch.match?.id,
          title: patch.match?.title,
        });
        if (!match) return { change: null, section: null };
        layout.customSlides = layout.customSlides.filter((s) => s.id !== match.id);
        return { change: `Removed the "${match.title}" slide`, section: match.afterSection };
      }
      // update (default)
      const match = findCustomSlide(layout, {
        slideId: patch.match?.id,
        title: patch.match?.title,
      });
      if (!match) return { change: null, section: null };
      const slide = findCustomSlide(layout, { slideId: match.id });
      if (!slide) return { change: null, section: null };
      let changed = false;
      const newTitle = str(set.title);
      if (newTitle) {
        slide.title = newTitle;
        changed = true;
      }
      if (set.body != null) {
        slide.body = str(set.body);
        changed = true;
      }
      if (set.kind === "prose" || set.kind === "table") {
        slide.kind = set.kind;
        changed = true;
      }
      const after = str(set.afterSection);
      if (after && (GUIDED_SECTIONS as readonly string[]).includes(after)) {
        slide.afterSection = after;
        changed = true;
      }
      if (!changed) return { change: null, section: null };
      const kindNote =
        set.kind === "table" ? " (converted to table)" : set.kind === "prose" ? " (converted to list)" : "";
      return {
        change: `Updated the "${match.title}" slide${kindNote}`,
        section: slide.afterSection,
      };
    }

    case "deckLayout.hiddenSections": {
      if (action === "set") {
        const next = stringArray(set.value ?? set.sections).filter((s) =>
          HIDEABLE_SECTIONS.includes(s as GuidedSection),
        );
        layout.hiddenSections = next as GuidedSection[];
        return { change: `Set hidden sections → ${next.join(", ") || "none"}`, section: next[0] ?? null };
      }
      const section = resolveSectionRef(str(set.section) || patch.match?.title);
      if (!section || !HIDEABLE_SECTIONS.includes(section)) return { change: null, section: null };
      if (action === "add") {
        if (!layout.hiddenSections.includes(section)) layout.hiddenSections.push(section);
        return { change: `Hid the ${section} slide`, section };
      }
      if (action === "remove") {
        layout.hiddenSections = layout.hiddenSections.filter((s) => s !== section);
        return { change: `Restored the ${section} slide`, section };
      }
      return { change: null, section: null };
    }

    case "deckLayout.sectionOrder": {
      if (action !== "set") return { change: null, section: null };
      const order = stringArray(set.value ?? set.order).filter((s) =>
        MOVABLE_SECTIONS.includes(s as GuidedSection),
      );
      if (!order.length) return { change: null, section: null };
      layout.sectionOrder = [...order, ...MOVABLE_SECTIONS.filter((s) => !order.includes(s))];
      return { change: `Reordered deck sections`, section: order[0] ?? null };
    }

    case "deckLayout.hiddenDashboardGroups": {
      const groupName = str(set.group ?? set.title ?? set.value);
      if (action === "set") {
        layout.hiddenDashboardGroups = stringArray(set.value ?? set.groups);
        return { change: `Set hidden dashboard groups`, section: "dashboard" };
      }
      const standard = groupName ? matchStandardGroup(groupName) : null;
      const name = standard ?? groupName;
      if (!name) return { change: null, section: null };
      if (action === "add") {
        if (!layout.hiddenDashboardGroups.some((g) => g.toLowerCase() === name.toLowerCase())) {
          layout.hiddenDashboardGroups.push(name);
        }
        return { change: `Hid dashboard group "${name}"`, section: "dashboard" };
      }
      if (action === "remove") {
        layout.hiddenDashboardGroups = layout.hiddenDashboardGroups.filter(
          (g) => g.toLowerCase() !== name.toLowerCase(),
        );
        return { change: `Restored dashboard group "${name}"`, section: "dashboard" };
      }
      return { change: null, section: null };
    }

    case "deckLayout.extraDashboardGroups": {
      const groupName = str(set.group ?? set.title ?? set.value);
      if (action === "set") {
        layout.extraDashboardGroups = stringArray(set.value ?? set.groups);
        return { change: `Set extra dashboard groups`, section: "dashboard" };
      }
      if (!groupName) return { change: null, section: null };
      if (action === "add") {
        if (!layout.extraDashboardGroups.some((g) => g.toLowerCase() === groupName.toLowerCase())) {
          layout.extraDashboardGroups.push(groupName);
        }
        return { change: `Added dashboard group "${groupName}"`, section: "dashboard" };
      }
      if (action === "remove") {
        layout.extraDashboardGroups = layout.extraDashboardGroups.filter(
          (g) => g.toLowerCase() !== groupName.toLowerCase(),
        );
        return { change: `Removed dashboard group "${groupName}"`, section: "dashboard" };
      }
      return { change: null, section: null };
    }

    default:
      return { change: null, section: null };
  }
}

function inferDefaultAction(patch: DeckPatch): DeckPatch["action"] {
  if (patch.target === "deckLayout.customSlides") {
    if (patch.action) return patch.action;
    return patch.match ? "update" : "add";
  }
  if (patch.target === "deckLayout.sectionOrder") return "set";
  if (patch.target === "deckOptions") return "set";
  return patch.action ?? "add";
}

/** Pure: merge deck-options patch into an options object. */
export function applyPatchToDeckOptions(
  options: Record<string, unknown>,
  patch: DeckPatch,
): { options: Record<string, unknown>; change: string | null } {
  if (patch.target !== "deckOptions") return { options, change: null };
  const set = patch.set ?? {};
  if (!Object.keys(set).length) return { options, change: null };

  const next = { ...options, ...set };

  // Normalize common presentation keys the renderer expects.
  if ("pageNumbers" in set || "pageNumberPosition" in set) {
    const raw = str(set.pageNumbers ?? set.pageNumberPosition ?? set.value);
    if (raw) {
      const off = /^(off|no|false|hide|remove|none)$/i.test(raw);
      next.pageNumbers = !off;
      next.pageNumberPosition = /both/i.test(raw)
        ? "bottom-both"
        : /left/i.test(raw)
          ? "bottom-left"
          : "bottom-right";
    }
  }
  if ("footer" in set) next.footerText = str(set.footer) || null;
  if ("footerText" in set) next.footerText = str(set.footerText) || null;
  if ("titleTag" in set) next.titleTag = str(set.titleTag) || null;

  const keys = Object.keys(set).join(", ");
  return { options: next, change: `Updated deck options (${keys})` };
}

/** Persist patches to the QBR cycle. Returns human-readable change lines. */
export async function applyDeckPatches(
  qbrCycleId: string,
  patches: DeckPatch[],
): Promise<PatchApplyOutcome> {
  if (!patches.length) return { changes: [], affectedSections: [] };

  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  if (!cycle) return { changes: [], affectedSections: [] };

  let layout = readDeckLayout(cycle.deckLayoutJson);
  let options = readDeckOptions(cycle.deckOptionsJson);
  const changes: string[] = [];
  const affectedSections: string[] = [];

  for (const patch of patches) {
    if (patch.target === "deckOptions") {
      const result = applyPatchToDeckOptions(options, patch);
      if (result.change) {
        options = result.options;
        changes.push(result.change);
      }
      continue;
    }
    const result = applyPatchToLayout(layout, patch);
    if (result.change) {
      changes.push(result.change);
      if (result.section && !affectedSections.includes(result.section)) {
        affectedSections.push(result.section);
      }
    }
  }

  if (changes.length) {
    await prisma.qbrCycle.update({
      where: { id: qbrCycleId },
      data: {
        deckLayoutJson: serializeDeckLayout(layout),
        deckOptionsJson: JSON.stringify(options),
      },
    });
    await audit({
      entityType: "QbrCycle",
      entityId: qbrCycleId,
      action: "slides.patched",
      metadata: { changes },
    });
  }

  return { changes, affectedSections };
}

/** Map applied patches to preview section keys for auto-scroll. */
export function changedSectionsForPatches(patches: DeckPatch[]): string[] {
  const out: string[] = [];
  for (const p of patches) {
    if (p.target === "deckLayout.customSlides") {
      const after = str(p.set?.afterSection);
      if (after) out.push(after);
      else if (p.match?.title) out.push("agenda");
    } else if (p.target === "deckLayout.hiddenSections") {
      const section = resolveSectionRef(str(p.set?.section) || p.match?.title);
      if (section) out.push(section);
    } else if (p.target.toLowerCase().includes("dashboard")) {
      if (!out.includes("dashboard")) out.push("dashboard");
    } else if (p.target === "deckLayout.sectionOrder") {
      const order = stringArray(p.set?.value ?? p.set?.order);
      if (order[0] && !out.includes(order[0])) out.push(order[0]);
    }
  }
  return out;
}
