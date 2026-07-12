import { generateSlideContent, translateSlideContentToLocale } from "../ai";
import { SlideContent } from "../ai/schemas";
import { METRIC_GROUPS } from "../constants";
import {
  defaultAgenda,
  formatLocaleDate,
  formatLocaleMonthYear,
  resolveQbrLocale,
  toConfirmLabel,
  localizeSlideContentForLocale,
  contentNeedsTranslation,
  type Locale,
} from "../i18n";
import { normalizeSlideContent } from "../ppt/textNormalize";
import { readDeckLayout } from "./deckLayout";
import { getQbrFull } from "./service";

type Qbr = NonNullable<Awaited<ReturnType<typeof getQbrFull>>>;

async function applyDeckLocale(content: SlideContent, locale: Locale, forceTranslate?: boolean): Promise<SlideContent> {
  let c = localizeSlideContentForLocale(content, locale);
  const loc = locale;
  const needsAi =
    forceTranslate || (loc === "fr" && contentNeedsTranslation(c, loc)) || (loc === "en" && contentNeedsTranslation(c, "fr"));
  if (needsAi) {
    const translated = await translateSlideContentToLocale(c, loc).catch(() => null);
    if (translated) c = localizeSlideContentForLocale(translated, loc);
  }
  return c;
}

/**
 * Build the client-facing slide content. Tries the AI drafter first, then
 * validates and falls back to a deterministic mapping from DB state. Either way
 * the renderer receives the same validated shape, covering the 7 core
 * client-facing sections with no internal enablement content. Sections are NOT
 * truncated here — the renderer fits/paginates overflow deterministically.
 */
export async function buildSlideContent(
  qbr: Qbr,
  opts?: { skipAi?: boolean; forceTranslate?: boolean },
): Promise<SlideContent> {
  const locale = resolveQbrLocale(qbr);
  const deterministic = deterministicSlideContent(qbr, locale);
  // Live-editor regenerations skip the AI drafter: render straight from the
  // (already edited) structured data so the turn is fast and faithful.
  if (opts?.skipAi) {
    const localized = await applyDeckLocale(deterministic, locale, opts.forceTranslate);
    return normalizeSlideContent(localized);
  }
  const ai = await generateSlideContent({ data: serializeForAi(qbr) }).catch(() => null);
  // Prefer AI content but guard against empty/invalid sections. Deck structure
  // (custom slides, hidden sections, order) is always the deterministic layout.
  if (ai && ai.priorityItems?.length >= 0 && ai.dashboard) {
    attachRowIds(ai, deterministic);
    const merged = {
      ...ai,
      title: deterministic.title,
      agenda: deterministic.agenda,
      dashboard: { ...ai.dashboard, hiddenGroups: deterministic.dashboard.hiddenGroups },
      customSlides: deterministic.customSlides,
      hiddenSections: deterministic.hiddenSections,
      sectionOrder: deterministic.sectionOrder,
    };
    const localized = await applyDeckLocale(merged, locale, opts?.forceTranslate);
    return normalizeSlideContent(localized);
  }
  const localized = await applyDeckLocale(deterministic, locale, opts?.forceTranslate);
  return normalizeSlideContent(localized);
}

/**
 * Best-effort: copy DB row ids from the deterministic content onto AI-drafted
 * content so editor operations can still target exact rows. The AI receives
 * items in DB order and is instructed to keep counts, so an index match is
 * reliable; when the AI changed the item count we leave ids off and the editor
 * falls back to text matching.
 */
function attachRowIds(ai: SlideContent, deterministic: SlideContent): void {
  const copyByIndex = <T extends { id?: string }>(target: T[], source: T[]) => {
    if (target.length !== source.length) return;
    target.forEach((item, i) => {
      item.id = source[i].id;
    });
  };
  copyByIndex(ai.followUps, deterministic.followUps);
  ai.followUps.forEach((f, i) => {
    if (f.id) f.dueDateIso = deterministic.followUps[i]?.dueDateIso;
  });
  copyByIndex(ai.priorityItems, deterministic.priorityItems);
  copyByIndex(ai.whatsNext, deterministic.whatsNext);
  copyByIndex(ai.dashboard.healthAndSafety, deterministic.dashboard.healthAndSafety);
  copyByIndex(ai.dashboard.operational, deterministic.dashboard.operational);
  copyByIndex(ai.dashboard.financial, deterministic.dashboard.financial);
}

function serializeForAi(qbr: Qbr) {
  return {
    clientName: qbr.account.clientName,
    quarter: qbr.quarter,
    year: qbr.year,
    status: qbr.status,
    commitments: qbr.commitments.map((c) => ({
      action: c.clientReadyText || c.action,
      status: c.status,
      owner: c.owner,
      dueDate: c.dueDate,
    })),
    priorityItems: qbr.priorityItems.map((p) => ({
      title: p.title,
      text: p.clientReadyText || p.rawInput,
    })),
    dashboardMetrics: qbr.dashboardMetrics.map((m) => ({
      group: m.group,
      label: m.label,
      value: m.value,
    })),
    upcomingItems: qbr.upcomingItems.map((u) => ({ title: u.title, text: u.clientReadyText })),
    missingInfoRequests: qbr.missingInfoRequests,
  };
}

export function deterministicSlideContent(qbr: Qbr, locale?: string | null): SlideContent {
  const loc = locale ?? resolveQbrLocale(qbr);
  const confirm = toConfirmLabel(loc);
  const layout = readDeckLayout(qbr.deckLayoutJson);

  let agenda = defaultAgenda(loc);
  if (qbr.agendaSectionsJson) {
    try {
      const custom = JSON.parse(qbr.agendaSectionsJson);
      if (Array.isArray(custom) && custom.length > 0) agenda = custom.map(String);
    } catch {
      /* keep default */
    }
  }

  // Row ids ride along so the editor can target edits/deletes at the exact DB
  // row — display text is normalized/rewritten/translated and can't be trusted
  // as a lookup key.
  const followUps = qbr.commitments.map((c, i) => ({
    id: c.id,
    number: i + 1,
    action: c.clientReadyText || c.action,
    status: c.status || "Open",
    owner: c.owner || confirm,
    dueDate: c.dueDate ? formatLocaleDate(c.dueDate, loc) : confirm,
    dueDateIso: c.dueDate ? c.dueDate.toISOString().slice(0, 10) : undefined,
  }));

  const priorityItems = qbr.priorityItems.map((p, i) => ({
    id: p.id,
    number: i + 1,
    title: p.title,
    explanation: p.clientReadyText || p.rawInput || "",
  }));

  const byGroup = (group: string) =>
    qbr.dashboardMetrics
      .filter((m) => m.group === group)
      .map((m) => ({ id: m.id, label: m.label, value: m.value || confirm }));
  const standardGroups = new Set(["Health & Safety", "Operational", "Financial"]);
  const customGroupTitles = [
    ...new Set([
      ...qbr.dashboardMetrics.map((m) => m.group).filter((g) => !standardGroups.has(g)),
      // Groups created before any metric exists in them (empty for now).
      ...layout.extraDashboardGroups,
    ]),
  ];
  const customDashboardGroups = customGroupTitles.map((group) => ({
    title: group,
    rows: byGroup(group),
  }));

  const whatsNext = qbr.upcomingItems.map((u, i) => ({
    id: u.id,
    number: i + 1,
    title: u.title,
    detail: u.clientReadyText || u.rawInput || "",
  }));

  return {
    title: {
      clientName: qbr.account.clientName,
      quarterYear: `${qbr.quarter} ${qbr.year}`,
      meetingMonthYear: qbr.meetingDate
        ? formatLocaleMonthYear(qbr.meetingDate, loc)
        : `${qbr.quarter} ${qbr.year}`,
    },
    agenda,
    followUps,
    priorityItems,
    dashboard: {
      healthAndSafety: byGroup("Health & Safety"),
      operational: byGroup("Operational"),
      financial: byGroup("Financial"),
      customGroups: customDashboardGroups,
      hiddenGroups: layout.hiddenDashboardGroups,
    },
    whatsNext,
    customSlides: layout.customSlides,
    hiddenSections: layout.hiddenSections,
    sectionOrder: layout.sectionOrder,
  };
}

export { METRIC_GROUPS };
