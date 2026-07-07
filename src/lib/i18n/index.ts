import { fr, type FrStrings } from "./locales/fr";
import { en, type EnStrings } from "./locales/en";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export type LocaleStrings = FrStrings | EnStrings;

const STRINGS: Record<Locale, LocaleStrings> = { fr, en };

/** Resolve a locale string to a valid Locale, defaulting to French. */
export function parseLocale(value?: string | null): Locale {
  if (value === "en" || value === "fr") return value;
  return DEFAULT_LOCALE;
}

/** Get all UI/deck strings for a locale. */
export function getStrings(locale?: string | null): LocaleStrings {
  return STRINGS[parseLocale(locale)];
}

/** Resolve deck render language (cycle override → account default → global default). */
export function resolveQbrLocale(cycle?: { language?: string | null; account?: { language?: string | null } | null }): Locale {
  if (cycle?.language) return parseLocale(cycle.language);
  if (cycle?.account?.language) return parseLocale(cycle.account.language);
  return DEFAULT_LOCALE;
}

/** Resolve editor/site UI language from deck options, then account default. */
export function resolveUiLocale(
  cycle?: {
    deckOptionsJson?: string | null;
    account?: { language?: string | null } | null;
  },
): Locale {
  if (cycle?.deckOptionsJson) {
    try {
      const o = JSON.parse(cycle.deckOptionsJson);
      if (o?.uiLocale === "en" || o?.uiLocale === "fr") return o.uiLocale;
    } catch {
      /* ignore */
    }
  }
  return parseLocale(cycle?.account?.language ?? DEFAULT_LOCALE);
}

/** Localized "To confirm" sentinel. */
export function toConfirmLabel(locale?: string | null): string {
  return getStrings(locale).toConfirm;
}

/** Map internal metric group keys to localized display names. */
export function localizedMetricGroup(group: string, locale?: string | null): string {
  const s = getStrings(locale);
  const g = group.toLowerCase();
  if (g.includes("safety") || g.includes("health") || g.includes("santé")) return s.metricGroups.healthAndSafety;
  if (g.includes("financ") || g.includes("billing")) return s.metricGroups.financial;
  return s.metricGroups.operational;
}

/** Reverse-map localized group name back to canonical English DB key. */
export function canonicalMetricGroup(group: string): "Health & Safety" | "Operational" | "Financial" {
  const g = group.toLowerCase();
  if (g.includes("safety") || g.includes("health") || g.includes("santé")) return "Health & Safety";
  if (g.includes("financ") || g.includes("billing")) return "Financial";
  return "Operational";
}

/** Default agenda sections for a locale. */
export function defaultAgenda(locale?: string | null): string[] {
  return [...getStrings(locale).deck.agendaItems];
}

/** Format a date using the locale tag. */
export function formatLocaleDate(date: Date | string | null | undefined, locale?: string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(getStrings(locale).localeTag, { year: "numeric", month: "short", day: "numeric" });
}

/** Format month/year for title slide. */
export function formatLocaleMonthYear(date: Date | string | null | undefined, locale?: string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(getStrings(locale).localeTag, { year: "numeric", month: "long" });
}

/** Build localized deck theme strings overlay (geometry stays in deckTheme.ts). */
export function getDeckStrings(locale?: string | null) {
  return getStrings(locale).deck;
}

/** Guided editor section order. */
export const GUIDED_SECTIONS = [
  "title",
  "agenda",
  "followUps",
  "priorities",
  "dashboard",
  "whatsNext",
  "questions",
] as const;

export type GuidedSection = (typeof GUIDED_SECTIONS)[number];

export interface EditorProgress {
  currentSection: GuidedSection;
  confirmedSections: GuidedSection[];
  guidedMode: boolean;
}

export function readEditorProgress(json?: string | null): EditorProgress {
  const defaults: EditorProgress = {
    currentSection: "title",
    confirmedSections: [],
    guidedMode: true,
  };
  if (!json) return defaults;
  try {
    const o = JSON.parse(json);
    return {
      currentSection: GUIDED_SECTIONS.includes(o.currentSection) ? o.currentSection : "title",
      confirmedSections: Array.isArray(o.confirmedSections)
        ? o.confirmedSections.filter((s: string) => GUIDED_SECTIONS.includes(s as GuidedSection))
        : [],
      guidedMode: o.guidedMode !== false,
    };
  } catch {
    return defaults;
  }
}

export { localizeSlideContentForLocale, localizeCommitmentStatus, localizeMetricLabel, contentNeedsTranslation } from "./deckContent";
export { detectEmailLocale } from "./detectLocale";

export function getGuidedPrompt(section: GuidedSection, locale?: string | null): string {
  const s = getStrings(locale);
  const sectionLabel = s.editor.sections[section];
  const prompt = s.editor.prompts[section];
  return s.editor.guidedIntro(sectionLabel, prompt);
}

export function nextGuidedSection(current: GuidedSection): GuidedSection | null {
  const idx = GUIDED_SECTIONS.indexOf(current);
  return idx < GUIDED_SECTIONS.length - 1 ? GUIDED_SECTIONS[idx + 1] : null;
}
