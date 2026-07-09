import type { CustomSlide } from "../ai/schemas";
import { GUIDED_SECTIONS, type GuidedSection } from "../i18n";
import { METRIC_GROUPS } from "../constants";

/**
 * Deck layout: everything about the SHAPE of the deck (as opposed to its
 * content rows): user-created custom slides, hidden built-in sections, the
 * order of the movable middle sections, and hidden/extra dashboard groups.
 *
 * Stored as a JSON blob on QbrCycle.deckLayoutJson so new structure edits never
 * need a migration. Hiding a built-in section keeps its underlying data —
 * un-hiding restores it exactly.
 */
export interface DeckLayout {
  /** Order of the movable middle sections (title stays first, questions last). */
  sectionOrder: string[];
  /** Built-in sections hidden from the rendered deck. */
  hiddenSections: string[];
  /** Dashboard group titles hidden from the dashboard slide. */
  hiddenDashboardGroups: string[];
  /** Custom dashboard groups created before any metric exists in them. */
  extraDashboardGroups: string[];
  /** User-created slides inserted between the built-in sections. */
  customSlides: CustomSlide[];
}

/** Sections whose position can be changed (title is pinned first, questions last). */
export const MOVABLE_SECTIONS: GuidedSection[] = [
  "agenda",
  "followUps",
  "priorities",
  "dashboard",
  "whatsNext",
];

/** Sections that can be hidden ("title" always renders). */
export const HIDEABLE_SECTIONS: GuidedSection[] = [
  "agenda",
  "followUps",
  "priorities",
  "dashboard",
  "whatsNext",
  "questions",
];

export function emptyDeckLayout(): DeckLayout {
  return {
    sectionOrder: [...MOVABLE_SECTIONS],
    hiddenSections: [],
    hiddenDashboardGroups: [],
    extraDashboardGroups: [],
    customSlides: [],
  };
}

/** Parse the stored deck-layout JSON blob (never throws; unknown keys dropped). */
export function readDeckLayout(json?: string | null): DeckLayout {
  const layout = emptyDeckLayout();
  if (!json) return layout;
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== "object") return layout;
    if (Array.isArray(o.sectionOrder)) {
      const order = o.sectionOrder.filter((s: unknown): s is GuidedSection =>
        MOVABLE_SECTIONS.includes(s as GuidedSection),
      );
      // Any movable section missing from a stored order keeps its default slot.
      layout.sectionOrder = [...order, ...MOVABLE_SECTIONS.filter((s) => !order.includes(s))];
    }
    if (Array.isArray(o.hiddenSections)) {
      layout.hiddenSections = o.hiddenSections.filter((s: unknown): s is GuidedSection =>
        HIDEABLE_SECTIONS.includes(s as GuidedSection),
      );
    }
    if (Array.isArray(o.hiddenDashboardGroups)) {
      layout.hiddenDashboardGroups = o.hiddenDashboardGroups.filter(
        (g: unknown): g is string => typeof g === "string" && !!g.trim(),
      );
    }
    if (Array.isArray(o.extraDashboardGroups)) {
      layout.extraDashboardGroups = o.extraDashboardGroups.filter(
        (g: unknown): g is string => typeof g === "string" && !!g.trim(),
      );
    }
    if (Array.isArray(o.customSlides)) {
      layout.customSlides = o.customSlides
        .filter((s: any) => s && typeof s.id === "string" && typeof s.title === "string")
        .map((s: any) => ({
          id: s.id,
          title: s.title,
          kind: s.kind === "table" ? "table" : "prose",
          body: typeof s.body === "string" ? s.body : "",
          afterSection: (GUIDED_SECTIONS as readonly string[]).includes(s.afterSection)
            ? s.afterSection
            : "whatsNext",
        }));
    }
  } catch {
    /* keep defaults */
  }
  return layout;
}

export function serializeDeckLayout(layout: DeckLayout): string {
  return JSON.stringify(layout);
}

export function newCustomSlideId(): string {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Case-insensitive standard-group match ("financial" → "Financial"). */
export function matchStandardGroup(name: string): string | null {
  const n = name.trim().toLowerCase();
  for (const g of METRIC_GROUPS) {
    if (g.toLowerCase() === n) return g;
  }
  if (/safety|health|santé/.test(n)) return "Health & Safety";
  if (/financ|billing/.test(n)) return "Financial";
  if (/operat|opération/.test(n)) return "Operational";
  return null;
}

/** Find a custom slide by id or (normalized) title. */
export function findCustomSlide(
  layout: DeckLayout,
  ref: { slideId?: string | null; title?: string | null },
): CustomSlide | undefined {
  if (ref.slideId) {
    const byId = layout.customSlides.find((s) => s.id === ref.slideId);
    if (byId) return byId;
  }
  const t = ref.title?.trim().toLowerCase();
  if (!t) return undefined;
  return (
    layout.customSlides.find((s) => s.title.trim().toLowerCase() === t) ??
    layout.customSlides.find((s) => s.title.trim().toLowerCase().includes(t))
  );
}
