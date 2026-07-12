/**
 * Agent answer mode helpers.
 *
 * Builds a compact, serializable QBR context for the LLM and a deterministic
 * fallback answer used when no OpenAI key is configured. The fallback answers
 * the common questions ("what else do you need?", "what's missing?",
 * "where are we?") with a specific, grouped breakdown instead of a generic ack.
 *
 * Pure functions — no DB access — so they're easy to unit test.
 */

import { TO_CONFIRM } from "../constants";

/** Snapshot of what a generated deck version actually contained. */
export interface DeckSnapshot {
  versionNumber: number;
  status: string;
  isFinal: boolean;
  title: string | null;
  generatedAt: string | null;
  priorities: string[];
  agenda: string[];
  metrics: { label: string; value: string }[];
  whatsNext: string[];
}

export interface AnswerContext {
  clientName: string;
  quarter: string;
  year: number;
  status: string;
  /** This quarter's QBR meeting date (ISO string), if known. */
  meetingDate?: string | null;
  /** Proposed date of the NEXT QBR/meeting (ISO string), if known. */
  nextMeetingDate?: string | null;
  /** Free-text notes carried over from the previous QBR cycle. */
  previousQbrNotes?: string | null;
  commitments: { action: string; status: string; owner: string | null }[];
  priorities: { title: string }[];
  metrics: { group: string; label: string; value: string | null; isConfirmed: boolean }[];
  upcomingItems: { title: string }[];
  missingInfo: { field: string; question: string; status: string }[];
  approvals: { status: string; approverEmail: string }[];
  deckVersions: { versionNumber: number; status: string }[];
  /** Content summary of the most recent deck (last presentation), if any. */
  latestDeck?: DeckSnapshot | null;
  recentEmails: { direction: string; subject: string | null }[];
}

export interface AnswerResult {
  answer: string;
  nextActions: string[];
}

function isMissingInfoQuestion(q: string): boolean {
  return /what (else )?(do|does) (you|we|i).*(need)|what'?s (missing|outstanding|left)|do you (still )?need|what (is|are) (missing|outstanding)/i.test(
    q,
  );
}

function isWhatChangedQuestion(q: string): boolean {
  return /what changed|since last (quarter|qbr|time)|what'?s (new|different)/i.test(q);
}

function isOwnerQuestion(q: string): boolean {
  return /who (owns|is responsible|is handling|has)/i.test(q);
}

function isRiskQuestion(q: string): boolean {
  return /open risks?|risks?\b|concerns?|blockers?/i.test(q);
}

function isMeetingDateQuestion(q: string): boolean {
  return /(date|when).{0,30}(meeting|qbr|review|present)|next (meeting|qbr|review|sync)|meeting date|when (do|are) we (meet|meeting)|when('?s| is) (the|our|next)/i.test(
    q,
  );
}

function isLastPresentationQuestion(q: string): boolean {
  return /(last|previous|prior|recent).{0,20}(presentation|deck|meeting|qbr|quarter|slide|review)|remember|recall|what (did|was) .*(present|discuss|cover|say|show)|last time/i.test(
    q,
  );
}

/** Broad "tell me everything / where are we / summarize" requests. */
function isOverviewQuestion(q: string): boolean {
  return /(all|every|the).{0,20}(info|information|details|context|data)|what (do|have) you (have|know|got|remember)|summar|recap|where (are we|do (we|things) stand)|status (update|report|check)|bring me up|catch me up|tell me (about|everything)|give me (an|a) (update|summary|status)/i.test(
    q,
  );
}

/** Format an ISO date string into a friendly label without external deps. */
function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** "When is the meeting / next QBR?" — answers from the stored date fields. */
function buildMeetingDateAnswer(ctx: AnswerContext): string[] {
  const lines: string[] = [];
  const meeting = fmtDate(ctx.meetingDate);
  const next = fmtDate(ctx.nextMeetingDate);
  if (meeting) lines.push(`This quarter's ${ctx.clientName} ${ctx.quarter} QBR meeting is scheduled for ${meeting}.`);
  if (next) lines.push(`The next QBR/meeting is proposed for ${next}.`);
  else lines.push("The next QBR/meeting date hasn't been set yet — reply with a date and I'll record it.");
  return lines;
}

/** "What was in the last presentation / do you remember last quarter?" recap. */
function buildLastPresentationAnswer(ctx: AnswerContext): string[] {
  const lines: string[] = [];
  const deck = ctx.latestDeck;
  if (deck) {
    const when = fmtDate(deck.generatedAt);
    const kind = deck.isFinal ? "final deck" : `draft (v${deck.versionNumber})`;
    lines.push(
      `The most recent ${kind}${deck.title ? ` — ${deck.title}` : ""}${when ? `, generated ${when}` : ""} covered:`,
    );
    if (deck.priorities.length) lines.push(`- Priorities: ${deck.priorities.join("; ")}`);
    if (deck.metrics.length)
      lines.push(`- Dashboard: ${deck.metrics.map((m) => `${m.label} ${m.value}`).join("; ")}`);
    if (deck.whatsNext.length) lines.push(`- What's next: ${deck.whatsNext.join("; ")}`);
  } else {
    lines.push("I don't have a generated deck on file for this cycle yet.");
  }
  if (ctx.previousQbrNotes) lines.push(`From the previous QBR on file: ${ctx.previousQbrNotes}`);
  return lines;
}

/** Build the grouped "here's what I still need" answer (matches the spec example). */
function buildMissingInfoAnswer(ctx: AnswerContext): AnswerResult {
  const openFollowUps = ctx.commitments.filter((c) => c.status !== "Complete");
  const unconfirmedMetrics = ctx.metrics.filter((m) => !m.isConfirmed || m.value === TO_CONFIRM);
  const openMissing = ctx.missingInfo.filter((m) => m.status === "Open");

  const lines: string[] = [`Here's what I still need from you for the ${ctx.clientName} deck this quarter:`, ""];

  let n = 1;
  // 1. Open follow-ups
  const followLines = openFollowUps.map((c) =>
    c.owner ? `Status of: ${c.action}` : `Owner for: ${c.action}`,
  );
  if (followLines.length || hasMissingField(openMissing, "followUpStatuses")) {
    lines.push(`${n++}. Open Follow-Ups`);
    if (followLines.length) followLines.forEach((l) => lines.push(`   - ${l}`));
    else lines.push("   - Current status of each previous follow-up");
    lines.push("");
  }

  // 2. Priority items
  if (ctx.priorities.length < 2 || hasMissingField(openMissing, "priorityItems")) {
    lines.push(`${n++}. Priority Items`);
    lines.push("   - Confirm the top 2-3 issues for this quarter");
    lines.push("");
  }

  // 3. Dashboard
  if (unconfirmedMetrics.length || hasMissingField(openMissing, "dashboardMetrics")) {
    lines.push(`${n++}. Dashboard`);
    if (unconfirmedMetrics.length) {
      unconfirmedMetrics.forEach((m) => lines.push(`   - ${m.label}`));
    } else {
      lines.push("   - Average inspection score");
      lines.push("   - Outstanding invoices");
      lines.push("   - Ticket counts");
    }
    lines.push("");
  }

  // 4. What's next
  if (!ctx.upcomingItems.length || hasMissingField(openMissing, "upcomingItems") || hasMissingField(openMissing, "nextQbrDate")) {
    lines.push(`${n++}. What's Next`);
    lines.push("   - Proposed next QBR date");
    lines.push("   - Any upcoming seasonal work or deployments");
    lines.push("");
  }

  lines.push('You can reply in bullets. "Unknown" is fine, and I\'ll mark it as To confirm.');

  return {
    answer: lines.join("\n").trim(),
    nextActions: ['Reply with what you know (bullets are fine — "Unknown" is okay).'],
  };
}

function hasMissingField(missing: AnswerContext["missingInfo"], field: string): boolean {
  return missing.some((m) => m.field === field);
}

function buildOwnerAnswer(ctx: AnswerContext): AnswerResult {
  const owned = ctx.commitments.map(
    (c) => `${c.action} — ${c.owner ? c.owner : "owner not yet assigned"}`,
  );
  return {
    answer: owned.length
      ? `Here's who owns the outstanding items for ${ctx.clientName} ${ctx.quarter} ${ctx.year}:\n${owned
          .map((o) => `- ${o}`)
          .join("\n")}`
      : `No outstanding follow-ups are recorded for ${ctx.clientName} ${ctx.quarter} ${ctx.year} yet.`,
    nextActions: owned.some((o) => o.includes("not yet assigned"))
      ? ["Reply with an owner for any unassigned items."]
      : [],
  };
}

function buildRiskAnswer(ctx: AnswerContext): string[] {
  const risks = ctx.priorities.map((p) => p.title);
  const unconfirmed = ctx.metrics.filter((m) => !m.isConfirmed || m.value === TO_CONFIRM);
  const lines = [`Open risks / priorities for ${ctx.clientName} ${ctx.quarter} ${ctx.year}:`];
  if (risks.length) risks.forEach((r) => lines.push(`- ${r}`));
  else lines.push("- No priority risks captured yet.");
  if (unconfirmed.length) {
    lines.push("", "Unconfirmed data that could hide risk:");
    unconfirmed.forEach((m) => lines.push(`- ${m.label}`));
  }
  return lines;
}

/** Comprehensive "where are we / what do you have" snapshot, dates included. */
function buildOverview(ctx: AnswerContext): string[] {
  const lines = [
    `Here's where ${ctx.clientName} ${ctx.quarter} ${ctx.year} stands (status: ${ctx.status.replace(/_/g, " ")}).`,
    `Captured so far — follow-ups: ${ctx.commitments.length}, priorities: ${ctx.priorities.length}, metrics: ${ctx.metrics.length}, what's-next: ${ctx.upcomingItems.length}.`,
  ];
  const meeting = fmtDate(ctx.meetingDate);
  const next = fmtDate(ctx.nextMeetingDate);
  if (meeting || next) {
    lines.push(
      `Meeting: ${meeting ?? "date not set"}${next ? ` · Next QBR proposed: ${next}` : " · next QBR date not set"}.`,
    );
  }
  if (ctx.latestDeck) {
    const d = ctx.latestDeck;
    lines.push(
      `Latest deck: ${d.isFinal ? "FINAL" : `draft v${d.versionNumber}`}${d.title ? ` (${d.title})` : ""}.`,
    );
  }
  const openMissing = ctx.missingInfo.filter((m) => m.status === "Open").map((m) => m.question);
  if (openMissing.length) {
    lines.push("", "Still open:");
    openMissing.forEach((m) => lines.push(`- ${m}`));
  }
  return lines;
}

/**
 * Deterministic conversational answer for any QBR question (no LLM required).
 *
 * Composes one or more topic-specific sections so MULTI-PART questions ("where
 * are we? and when's the next meeting? and what did we present last time?") are
 * each answered, instead of collapsing into a single rigid template. Falls back
 * to a full overview (which still surfaces dates + the last deck) when no
 * specific topic is recognized, so nothing the user asked is silently dropped.
 */
export function deterministicAnswer(question: string, ctx: AnswerContext): AnswerResult {
  // Missing-info and owner questions are strong, self-contained answers — keep
  // them standalone when they're the dominant ask (preserves the spec format).
  const wantsMissing = isMissingInfoQuestion(question);
  const wantsOwner = isOwnerQuestion(question);
  const wantsRisk = isRiskQuestion(question);
  const wantsChanged = isWhatChangedQuestion(question);
  const wantsDate = isMeetingDateQuestion(question);
  const wantsLast = isLastPresentationQuestion(question);
  const wantsOverview = isOverviewQuestion(question);

  const specific = [wantsMissing, wantsOwner, wantsRisk, wantsChanged, wantsDate, wantsLast].filter(
    Boolean,
  ).length;

  // Single dominant intent → return its dedicated answer unchanged.
  if (specific === 1 && wantsMissing && !wantsOverview) return buildMissingInfoAnswer(ctx);
  if (specific === 1 && wantsOwner && !wantsOverview) return buildOwnerAnswer(ctx);

  const sections: string[] = [];
  const nextActions: string[] = [];

  if (wantsMissing) {
    const mi = buildMissingInfoAnswer(ctx);
    sections.push(mi.answer);
    nextActions.push(...mi.nextActions);
  }
  if (wantsOwner) {
    const o = buildOwnerAnswer(ctx);
    sections.push(o.answer);
    nextActions.push(...o.nextActions);
  }
  if (wantsRisk) sections.push(buildRiskAnswer(ctx).join("\n"));
  if (wantsChanged) {
    sections.push(
      `Since the last cycle, ${ctx.clientName} ${ctx.quarter} ${ctx.year} has ${ctx.commitments.length} follow-ups, ${ctx.priorities.length} priority items, ${ctx.metrics.length} metrics, and ${ctx.upcomingItems.length} what's-next items captured. Status: ${ctx.status.replace(/_/g, " ")}.`,
    );
  }
  if (wantsDate) {
    sections.push(buildMeetingDateAnswer(ctx).join("\n"));
    if (!ctx.nextMeetingDate) nextActions.push("Reply with the next QBR date and I'll record it.");
  }
  if (wantsLast) sections.push(buildLastPresentationAnswer(ctx).join("\n"));

  // No specific topic matched, or it's an explicit overview ask → full snapshot.
  if (sections.length === 0 || wantsOverview) {
    sections.push(buildOverview(ctx).join("\n"));
    // On a broad "what do you have" ask, also recap the last presentation if we
    // never explicitly added it above.
    if (wantsOverview && !wantsLast && (ctx.latestDeck || ctx.previousQbrNotes)) {
      sections.push(buildLastPresentationAnswer(ctx).join("\n"));
    }
    const openMissing = ctx.missingInfo.filter((m) => m.status === "Open");
    if (openMissing.length) nextActions.push("Reply with the open items above — I'll capture them against the QBR.");
  }

  return { answer: sections.join("\n\n").trim(), nextActions: dedupe(nextActions) };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
}
