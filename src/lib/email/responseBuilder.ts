/**
 * Central outbound-email builder. EVERY bot email is produced here so the
 * format is consistent and always carries a context header:
 *
 *   BR: [Client Name] — [Quarter Year]
 *   Status: [Collecting inputs / Draft generated / VP review / Missing info / …]
 *   Mode: [Captured update / Answer / Missing info / Approval]
 *
 * The header makes a reply understandable even when provider threading fails.
 */

import type { Locale } from "../constants";
import { EmailContent } from "./templates";
import {
  EMAIL_FONT_FAMILY,
  escapeHtml,
  wrapEmailHtml,
  emailContextHeaderStyle,
} from "./branding";

/** Email "mode" surfaced in the context header (see requirement #2/#3). */
export type EmailMode =
  | "Captured update"
  | "Answer"
  | "Missing info"
  | "Approval";

/**
 * Localized static labels for the outbound email scaffold. The dynamic body
 * (agent reply, intros, captured items) is localized upstream; this covers the
 * fixed chrome so a reply reads entirely in one language.
 */
const LABELS: Record<
  Locale,
  {
    qbr: string;
    qbrUnmatched: string;
    status: string;
    statusUnmatched: string;
    mode: string;
    captured: string;
    stillNeeded: string;
    nextAction: string;
    approval: string;
    rePrefix: string;
    reFallback: string;
    modes: Record<EmailMode, string>;
    statuses: Record<string, string>;
  }
> = {
  en: {
    qbr: "BR",
    qbrUnmatched: "BR: (could not match this email to a BR)",
    status: "Status",
    statusUnmatched: "Unmatched",
    mode: "Mode",
    captured: "Captured:",
    stillNeeded: "Still needed:",
    nextAction: "Next action:",
    approval: "Reply APPROVE or send edits.",
    rePrefix: "Re:",
    reFallback: "Re: your BR email",
    modes: {
      "Captured update": "Captured update",
      Answer: "Answer",
      "Missing info": "Missing info",
      Approval: "Approval",
    },
    statuses: {
      DRAFT_CREATED: "Draft created",
      COLLECTING_INPUTS: "Collecting inputs",
      PREP_FINAL_SPRINT: "Final prep",
      DRAFT_GENERATED: "Draft generated",
      VP_REVIEW: "VP review",
      APPROVED: "Approved",
      READY_FOR_MEETING: "Ready for meeting",
      PRESENTED: "Presented",
      SURVEY_SENT: "Survey sent",
      CLOSED: "Closed",
    },
  },
  fr: {
    qbr: "BTR",
    qbrUnmatched: "BTR : (impossible d'associer ce courriel à un BTR)",
    status: "Statut",
    statusUnmatched: "Non associé",
    mode: "Mode",
    captured: "Saisi :",
    stillNeeded: "Encore requis :",
    nextAction: "Prochaine action :",
    approval: "Répondez APPROUVER ou envoyez vos modifications.",
    rePrefix: "Rép. :",
    reFallback: "Rép. : votre courriel BTR",
    modes: {
      "Captured update": "Mise à jour saisie",
      Answer: "Réponse",
      "Missing info": "Information manquante",
      Approval: "Approbation",
    },
    statuses: {
      DRAFT_CREATED: "Ébauche créée",
      COLLECTING_INPUTS: "Collecte des informations",
      PREP_FINAL_SPRINT: "Préparation finale",
      DRAFT_GENERATED: "Ébauche générée",
      VP_REVIEW: "Révision par le VP",
      APPROVED: "Approuvé",
      READY_FOR_MEETING: "Prêt pour la rencontre",
      PRESENTED: "Présenté",
      SURVEY_SENT: "Sondage envoyé",
      CLOSED: "Fermé",
    },
  },
};

function labelsFor(locale: Locale | undefined) {
  return LABELS[locale ?? "en"] ?? LABELS.en;
}

export interface QbrContextHeaderInput {
  clientName: string;
  quarter: string;
  year: number;
  /** Raw QbrCycle.status (e.g. "COLLECTING_INPUTS") OR a friendly label. */
  status: string;
}

export interface BuildEmailResponseArgs {
  /** BR identity for the header. Null when no cycle could be matched. */
  qbrContext: QbrContextHeaderInput | null;
  mode: EmailMode;
  /** Language the email is written in. Defaults to English for back-compat. */
  locale?: Locale;
  /** Used to build a "Re:" subject so replies stay readable if threading fails. */
  replySubject?: string | null;
  /** Newly captured/updated items — shown only when something actually changed. */
  capturedItems?: string[];
  /** Conversational answer body (Agent answer mode). */
  answerText?: string;
  /** Outstanding info still required from the user. */
  missingInfo?: string[];
  /** Clear next-step instructions. */
  nextActions?: string[];
  /** When true, append "Reply APPROVE or send edits." */
  approvalRequest?: boolean;
  /** Optional extra intro line shown under the header. */
  intro?: string;
}

export function statusLabel(
  status: string | null | undefined,
  locale?: Locale,
): string {
  const l = labelsFor(locale);
  if (!status) return locale === "fr" ? "Inconnu" : "Unknown";
  return l.statuses[status] ?? status.replace(/_/g, " ");
}

/** Build the 3-line text context header. Always present on every email. */
export function buildContextHeader(
  qbrContext: QbrContextHeaderInput | null,
  mode: EmailMode,
  locale?: Locale,
): string {
  const l = labelsFor(locale);
  const qbrLine = qbrContext
    ? `${l.qbr}: ${qbrContext.clientName} — ${qbrContext.quarter} ${qbrContext.year}`
    : l.qbrUnmatched;
  const statusLine = `${l.status}: ${qbrContext ? statusLabel(qbrContext.status, locale) : l.statusUnmatched}`;
  const modeLine = `${l.mode}: ${l.modes[mode]}`;
  return `${qbrLine}\n${statusLine}\n${modeLine}`;
}

function headerHtml(
  qbrContext: QbrContextHeaderInput | null,
  mode: EmailMode,
  locale?: Locale,
): string {
  const header = buildContextHeader(qbrContext, mode, locale);
  return `<div style="${emailContextHeaderStyle()}">${header
    .split("\n")
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("")}</div>`;
}

function bulletList(items: string[]): string {
  return `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
}

/** Compute a thread-friendly subject (prefixed with a single "Re:"). */
export function replySubjectFor(
  original: string | null | undefined,
  qbrContext: QbrContextHeaderInput | null,
  locale?: Locale,
): string {
  const l = labelsFor(locale);
  const base = (original ?? "").trim();
  if (base) {
    return /^re:|^rép/i.test(base) ? base : `${l.rePrefix} ${base}`;
  }
  if (qbrContext) {
    return `${l.rePrefix} ${l.qbr} — ${qbrContext.clientName} ${qbrContext.quarter} ${qbrContext.year}`;
  }
  return l.reFallback;
}

/**
 * THE single source of outbound email content. All handlers must call this.
 */
export function buildEmailResponse(args: BuildEmailResponseArgs): EmailContent {
  const { qbrContext, mode, locale } = args;
  const l = labelsFor(locale);
  const header = buildContextHeader(qbrContext, mode, locale);

  // De-duplicate captured items defensively (never repeat the same line twice).
  const captured = dedupeStrings(args.capturedItems ?? []);
  const missing = dedupeStrings(args.missingInfo ?? []);
  const next = dedupeStrings(args.nextActions ?? []);

  const textParts: string[] = [header, ""];
  const htmlParts: string[] = [headerHtml(qbrContext, mode, locale)];

  if (args.intro) {
    textParts.push(args.intro, "");
    htmlParts.push(
      `<p style="font-family:${EMAIL_FONT_FAMILY}">${escapeHtml(args.intro).replace(/\n/g, "<br/>")}</p>`,
    );
  }

  if (args.answerText) {
    textParts.push(args.answerText, "");
    htmlParts.push(
      `<p style="font-family:${EMAIL_FONT_FAMILY}">${escapeHtml(args.answerText).replace(/\n/g, "<br/>")}</p>`,
    );
  }

  if (captured.length) {
    textParts.push(l.captured, ...captured.map((c) => `- ${c}`), "");
    htmlParts.push(
      `<p><strong>${escapeHtml(l.captured)}</strong></p>${bulletList(captured)}`,
    );
  }

  if (missing.length) {
    textParts.push(l.stillNeeded, ...missing.map((m) => `- ${m}`), "");
    htmlParts.push(
      `<p><strong>${escapeHtml(l.stillNeeded)}</strong></p>${bulletList(missing)}`,
    );
  }

  if (next.length) {
    textParts.push(l.nextAction, ...next.map((n) => `- ${n}`), "");
    htmlParts.push(
      `<p><strong>${escapeHtml(l.nextAction)}</strong></p>${bulletList(next)}`,
    );
  }

  if (args.approvalRequest) {
    textParts.push(l.approval);
    htmlParts.push(`<p><strong>${escapeHtml(l.approval)}</strong></p>`);
  }

  const subject = subjectForResponse(args);
  const text = textParts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const html = wrapEmailHtml(subject, htmlParts.join("\n"));
  return { subject, text, html };
}

function subjectForResponse(args: BuildEmailResponseArgs): string {
  return replySubjectFor(args.replySubject, args.qbrContext, args.locale);
}

/** Case-insensitive de-dupe that preserves first-seen order. */
export function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
