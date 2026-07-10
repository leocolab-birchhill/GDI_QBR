import type { CustomSlide, DeckPatch, SlideContent } from "../ai/schemas";
import type { GuidedSection } from "../i18n";
import { resolveDeckSequence } from "../ppt/slideManifest";
import { MOVABLE_SECTIONS } from "./deckLayout";

export type ReorderItem =
  | { id: string; kind: "section"; section: GuidedSection }
  | { id: string; kind: "custom"; slideId: string };

const PINNED_SECTIONS = new Set<GuidedSection>(["title", "questions"]);

export function isPinnedReorderItem(item: ReorderItem): boolean {
  return item.kind === "section" && PINNED_SECTIONS.has(item.section);
}

/** Flat slide list in the same order as the live preview and downloaded deck. */
export function buildReorderItems(content: SlideContent): ReorderItem[] {
  return resolveDeckSequence(content).map((entry) => {
    if (entry.type === "section") {
      return { id: entry.section, kind: "section", section: entry.section };
    }
    return { id: entry.slide.id, kind: "custom", slideId: entry.slide.id };
  });
}

function fullMovableOrder(content: SlideContent): GuidedSection[] {
  const stored = (content.sectionOrder ?? []).filter((s): s is GuidedSection =>
    MOVABLE_SECTIONS.includes(s as GuidedSection),
  );
  return [...stored, ...MOVABLE_SECTIONS.filter((s) => !stored.includes(s))];
}

function customsEqual(a: CustomSlide[], b: CustomSlide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((slide, index) => {
    const other = b[index];
    return (
      other &&
      other.id === slide.id &&
      other.afterSection === slide.afterSection &&
      other.title === slide.title &&
      other.kind === slide.kind &&
      other.body === slide.body
    );
  });
}

/** Build deck patches that apply a new flat slide order. */
export function computeReorderPatches(
  content: SlideContent,
  newOrder: ReorderItem[],
): DeckPatch[] {
  const patches: DeckPatch[] = [];

  const newSectionOrder = newOrder
    .filter((item): item is ReorderItem & { kind: "section" } => item.kind === "section")
    .map((item) => item.section)
    .filter((section) => MOVABLE_SECTIONS.includes(section));

  const nextMovableOrder = [
    ...newSectionOrder,
    ...MOVABLE_SECTIONS.filter((section) => !newSectionOrder.includes(section)),
  ];
  const currentMovableOrder = fullMovableOrder(content);
  if (JSON.stringify(nextMovableOrder) !== JSON.stringify(currentMovableOrder)) {
    patches.push({
      target: "deckLayout.sectionOrder",
      action: "set",
      set: { value: nextMovableOrder },
    });
  }

  const customsById = new Map((content.customSlides ?? []).map((slide) => [slide.id, slide]));
  const newCustomSlides: CustomSlide[] = [];
  let lastSection: GuidedSection = "title";

  for (const item of newOrder) {
    if (item.kind === "section") {
      lastSection = item.section;
      continue;
    }
    const slide = customsById.get(item.slideId);
    if (!slide) continue;
    newCustomSlides.push({ ...slide, afterSection: lastSection });
  }

  for (const slide of content.customSlides ?? []) {
    if (!newCustomSlides.some((entry) => entry.id === slide.id)) {
      newCustomSlides.push(slide);
    }
  }

  const currentCustomSlides = content.customSlides ?? [];
  if (!customsEqual(newCustomSlides, currentCustomSlides)) {
    patches.push({
      target: "deckLayout.customSlides",
      action: "set",
      set: { value: newCustomSlides },
    });
  }

  return patches;
}

export function moveReorderItem(
  items: ReorderItem[],
  index: number,
  direction: -1 | 1,
): ReorderItem[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  if (isPinnedReorderItem(items[index]) || isPinnedReorderItem(items[target])) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
