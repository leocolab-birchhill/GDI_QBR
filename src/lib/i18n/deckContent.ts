import type { SlideContent } from "../ai/schemas";
import type { Locale } from "./index";
import { toConfirmLabel } from "./index";

/** Follow-up / commitment status labels by locale. Keys are normalized English. */
const COMMITMENT_STATUS: Record<string, { en: string; fr: string }> = {
  open: { en: "Open", fr: "Ouvert" },
  "in progress": { en: "In Progress", fr: "En cours" },
  complete: { en: "Complete", fr: "Complété" },
  completed: { en: "Completed", fr: "Complété" },
  "to confirm": { en: "To confirm", fr: "À confirmer" },
  closed: { en: "Closed", fr: "Fermé" },
  waived: { en: "Waived", fr: "Dispensé" },
};

/** Common dashboard metric labels (seed + typical QBR vocabulary). */
const METRIC_LABELS: Record<string, { en: string; fr: string }> = {
  "injuries reported": { en: "Injuries reported", fr: "Blessures signalées" },
  "near misses": { en: "Near misses", fr: "Quasi-accidents" },
  "average inspection score": { en: "Average inspection score", fr: "Score moyen d'inspection" },
  "service requests completed": { en: "Service requests completed", fr: "Demandes de service complétées" },
  "outstanding invoices": { en: "Outstanding invoices", fr: "Factures en souffrance" },
  "billing accuracy": { en: "Billing accuracy", fr: "Exactitude de la facturation" },
  "client satisfaction": { en: "Client satisfaction", fr: "Satisfaction client" },
  "response time": { en: "Response time", fr: "Délai de réponse" },
  "work orders completed": { en: "Work orders completed", fr: "Bons de travail complétés" },
  "safety incidents": { en: "Safety incidents", fr: "Incidents de sécurité" },
  "lost time injuries": { en: "Lost time injuries", fr: "Blessures avec perte de temps" },
  "to be confirmed": { en: "To be confirmed", fr: "À confirmer" },
};

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

/** Map a commitment status string to the target locale. */
export function localizeCommitmentStatus(status: string, locale: Locale): string {
  const key = normKey(status);
  const entry = COMMITMENT_STATUS[key];
  if (entry) return locale === "fr" ? entry.fr : entry.en;
  // Partial match (e.g. "In progress" variants)
  for (const [, v] of Object.entries(COMMITMENT_STATUS)) {
    if (normKey(v.en) === key || normKey(v.fr) === key) {
      return locale === "fr" ? v.fr : v.en;
    }
  }
  return status;
}

/** Map a dashboard metric label to the target locale when a glossary entry exists. */
export function localizeMetricLabel(label: string, locale: Locale): string {
  const key = normKey(label);
  const entry = METRIC_LABELS[key];
  if (entry) return locale === "fr" ? entry.fr : entry.en;
  for (const [, v] of Object.entries(METRIC_LABELS)) {
    if (normKey(v.en) === key || normKey(v.fr) === key) {
      return locale === "fr" ? v.fr : v.en;
    }
  }
  return label;
}

/** Normalize sentinel values (To confirm / À confirmer) for the target locale. */
export function localizeValue(value: string, locale: Locale): string {
  const key = normKey(value);
  if (key === "to confirm" || key === "à confirmer" || key === "a confirmer" || key === "to be confirmed") {
    return toConfirmLabel(locale);
  }
  return value;
}

/**
 * Apply glossary-based localization to slide content pulled from storage.
 * Structural deck strings (headings, agenda) are handled by localizedTheme;
 * this covers dynamic DB fields: statuses, metric labels, sentinels, and
 * reverses FR→EN when switching back to English where glossary entries exist.
 */
export function localizeSlideContentForLocale(content: SlideContent, locale: Locale): SlideContent {
  const confirm = toConfirmLabel(locale);

  return {
    title: { ...content.title },
    agenda: [...content.agenda],
    followUps: content.followUps.map((f) => ({
      ...f,
      action: f.action,
      status: localizeCommitmentStatus(f.status, locale),
      owner: f.owner === "To confirm" || f.owner === "À confirmer" ? confirm : f.owner,
      dueDate: localizeValue(f.dueDate, locale),
    })),
    priorityItems: content.priorityItems.map((p) => ({ ...p })),
    dashboard: {
      healthAndSafety: content.dashboard.healthAndSafety.map((r) => ({
        label: localizeMetricLabel(r.label, locale),
        value: localizeValue(r.value, locale),
      })),
      operational: content.dashboard.operational.map((r) => ({
        label: localizeMetricLabel(r.label, locale),
        value: localizeValue(r.value, locale),
      })),
      financial: content.dashboard.financial.map((r) => ({
        label: localizeMetricLabel(r.label, locale),
        value: localizeValue(r.value, locale),
      })),
    },
    whatsNext: content.whatsNext.map((u) => ({ ...u })),
  };
}

/** Returns true if stored prose likely needs AI translation for the target locale. */
export function contentNeedsTranslation(content: SlideContent, targetLocale: Locale): boolean {
  const sample = [
    ...content.followUps.map((f) => `${f.action} ${f.status}`),
    ...content.priorityItems.map((p) => `${p.title} ${p.explanation}`),
    ...content.whatsNext.map((u) => `${u.title} ${u.detail}`),
    ...content.dashboard.healthAndSafety.map((r) => r.label),
    ...content.dashboard.operational.map((r) => r.label),
    ...content.dashboard.financial.map((r) => r.label),
  ].join(" ");
  if (targetLocale === "fr") {
    return /\b(the|and|with|during|remains|is|are|will|team|access|reported|outstanding)\b/i.test(sample);
  }
  return /\b(avec|pendant|équipe|reste|sont|est|accès|conformité|signalées|souffrance|moyen)\b/i.test(sample);
}
