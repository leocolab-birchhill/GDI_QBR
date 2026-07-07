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
  // Prefer AI content but guard against empty/invalid sections.
  if (ai && ai.priorityItems?.length >= 0 && ai.dashboard) {
    const merged = {
      ...ai,
      title: deterministic.title,
      agenda: deterministic.agenda,
    };
    const localized = await applyDeckLocale(merged, locale, opts?.forceTranslate);
    return normalizeSlideContent(localized);
  }
  const localized = await applyDeckLocale(deterministic, locale, opts?.forceTranslate);
  return normalizeSlideContent(localized);
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

  let agenda = defaultAgenda(loc);
  if (qbr.agendaSectionsJson) {
    try {
      const custom = JSON.parse(qbr.agendaSectionsJson);
      if (Array.isArray(custom) && custom.length > 0) agenda = custom.map(String);
    } catch {
      /* keep default */
    }
  }

  const followUps = qbr.commitments.map((c, i) => ({
    number: i + 1,
    action: c.clientReadyText || c.action,
    status: c.status || "Open",
    owner: c.owner || confirm,
    dueDate: c.dueDate ? formatLocaleDate(c.dueDate, loc) : confirm,
  }));

  const priorityItems = qbr.priorityItems.map((p, i) => ({
    number: i + 1,
    title: p.title,
    explanation: p.clientReadyText || p.rawInput || "",
  }));

  const byGroup = (group: string) =>
    qbr.dashboardMetrics
      .filter((m) => m.group === group)
      .map((m) => ({ label: m.label, value: m.value || confirm }));
  const standardGroups = new Set(["Health & Safety", "Operational", "Financial"]);
  const customDashboardGroups = [...new Set(qbr.dashboardMetrics.map((m) => m.group).filter((g) => !standardGroups.has(g)))]
    .map((group) => ({
      title: group,
      rows: byGroup(group),
    }))
    .filter((g) => g.rows.length > 0);

  const whatsNext = qbr.upcomingItems.map((u, i) => ({
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
    },
    whatsNext,
  };
}

export { METRIC_GROUPS };
