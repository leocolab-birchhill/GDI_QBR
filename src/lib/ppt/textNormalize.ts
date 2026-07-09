import type { SlideContent } from "../ai/schemas";
import { TO_CONFIRM } from "../constants";

/**
 * Text normalization for client-facing deck content.
 *
 * Dynamic content (AI-drafted or hand-entered) arrives with inconsistent casing,
 * stray whitespace, double spaces, spaces before punctuation, and missing
 * terminal punctuation. Before any content reaches the renderer or the live
 * preview it is run through these normalizers so the deck reads at a consistent,
 * MBB-grade standard regardless of how the source text was typed.
 *
 * The transforms are deliberately conservative and IDEMPOTENT (running them
 * twice yields the same result) so they can be applied both where content is
 * built and again defensively at render time without compounding changes.
 * Proper nouns and existing capitalization are preserved — only the FIRST
 * letter of headlines/sentences is touched, never whole-word title-casing.
 */

/** Sentinel/placeholder values that must pass through completely untouched. */
const SENTINELS = new Set([
  "",
  "—",
  "-",
  TO_CONFIRM.toLowerCase(),
  "à confirmer",
  "a confirmer",
  "to be confirmed",
]);

function isSentinel(s: string): boolean {
  return SENTINELS.has(s.trim().toLowerCase());
}

/**
 * Whitespace + punctuation hygiene shared by every normalizer:
 *   - collapse runs of whitespace to a single space and trim the ends
 *   - drop spaces sitting before , . ; : ! ?
 *   - guarantee a single space after sentence punctuation followed by a letter
 *   - tidy spacing just inside ( ) brackets
 *   - collapse accidental repeated . , ; : punctuation
 */
export function cleanText(input: string): string {
  if (!input) return "";
  let s = input.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  // Add a single space after , ; : only when a WORD follows — never between
  // digits, so thousands separators / times (e.g. "$1,200", "12:30") survive.
  s = s.replace(/([,;:])(?=[A-Za-z])/g, "$1 ");
  s = s.replace(/([.!?])(?=[A-Za-z])/g, "$1 ");
  s = s.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  s = s.replace(/([,;:.])\1+/g, "$1");
  return s.trim();
}

/** Capitalize the first alphabetic character, leaving everything else as typed. */
function capitalizeFirst(s: string): string {
  const m = s.match(/[A-Za-z]/);
  if (!m || m.index === undefined) return s;
  const i = m.index;
  return s.slice(0, i) + s[i].toUpperCase() + s.slice(i + 1);
}

/**
 * Headline style for titles and short labels: cleaned, first letter capitalized,
 * and any single trailing sentence-period removed (titles are not sentences).
 * "?" / "!" are kept because they carry meaning.
 */
export function toHeadline(input: string): string {
  const s = cleanText(input);
  if (!s || isSentinel(s)) return s;
  return capitalizeFirst(s).replace(/\.\s*$/, "");
}

/**
 * Sentence style for body prose: cleaned, first letter capitalized, and a
 * terminal period added when the text does not already end in . ! ? or …
 */
export function toSentence(input: string): string {
  const s = cleanText(input);
  if (!s || isSentinel(s)) return s;
  const capped = capitalizeFirst(s);
  return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
}

/** Short enumerated label (status, etc.): cleaned + first letter capitalized. */
export function toLabel(input: string): string {
  const s = cleanText(input);
  if (!s || isSentinel(s)) return s;
  return capitalizeFirst(s);
}

/**
 * A data value (metric value, owner name, date): cleaned only. Casing, numbers,
 * symbols (%, $), and the "To confirm" sentinel are preserved exactly.
 */
export function toValue(input: string): string {
  const s = cleanText(input);
  return isSentinel(s) ? s.trim() : s;
}

/**
 * Normalize every text field of a SlideContent in place-free fashion (returns a
 * new object). Applied before rendering AND before building the preview manifest
 * so the downloaded deck and the on-screen preview are byte-for-byte consistent.
 */
export function normalizeSlideContent(content: SlideContent): SlideContent {
  return {
    title: {
      clientName: cleanText(content.title.clientName),
      quarterYear: cleanText(content.title.quarterYear),
      meetingMonthYear: cleanText(content.title.meetingMonthYear),
    },
    // Agenda items are deliberately-styled navigation labels (uppercased to
    // mirror the section headers) — only trim/collapse, never re-case.
    agenda: content.agenda.map((a) => cleanText(a)),
    followUps: content.followUps.map((f) => ({
      number: f.number,
      action: toSentence(f.action),
      status: toLabel(f.status),
      owner: toValue(f.owner),
      dueDate: toValue(f.dueDate),
    })),
    priorityItems: content.priorityItems.map((p) => ({
      number: p.number,
      title: toHeadline(p.title),
      explanation: toSentence(p.explanation),
    })),
    dashboard: {
      healthAndSafety: content.dashboard.healthAndSafety.map((r) => ({ label: toLabel(r.label), value: toValue(r.value) })),
      operational: content.dashboard.operational.map((r) => ({ label: toLabel(r.label), value: toValue(r.value) })),
      financial: content.dashboard.financial.map((r) => ({ label: toLabel(r.label), value: toValue(r.value) })),
      customGroups: content.dashboard.customGroups?.map((g) => ({
        title: toLabel(g.title),
        rows: g.rows.map((r) => ({ label: toLabel(r.label), value: toValue(r.value) })),
      })),
      hiddenGroups: content.dashboard.hiddenGroups,
    },
    whatsNext: content.whatsNext.map((u) => ({
      number: u.number,
      title: toHeadline(u.title),
      detail: toSentence(u.detail),
    })),
    // Deck structure passes through untouched (custom slide bodies keep the
    // user's exact line/cell formatting; only the title is headline-styled).
    customSlides: content.customSlides?.map((s) => ({ ...s, title: toHeadline(s.title) })),
    hiddenSections: content.hiddenSections,
    sectionOrder: content.sectionOrder,
  };
}
