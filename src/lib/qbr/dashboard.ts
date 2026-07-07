import { TO_CONFIRM } from "../constants";
import { getStrings, type Locale } from "../i18n";

export type AttentionKind =
  | "vp_review"
  | "missing_info"
  | "unconfirmed_metrics"
  | "meeting_soon"
  | "no_draft"
  | "meeting_overdue"
  | "stale";

export type HealthLevel = "red" | "amber" | "green" | "neutral";

export type AttentionSeverity = "high" | "medium" | "low";

export interface AttentionItem {
  kind: AttentionKind;
  label: string;
  severity: AttentionSeverity;
}

export interface PersonRef {
  id: string;
  name: string;
  email: string;
}

export interface DashboardCycle {
  id: string;
  clientName: string;
  quarter: string;
  year: number;
  status: string;
  meetingDate: string | null;
  region: string | null;
  vpOwner: PersonRef | null;
  director: PersonRef | null;
  accountManager: PersonRef | null;
  openMissingInfo: number;
  unconfirmedMetrics: number;
  vpApproved: boolean;
  hasDraft: boolean;
  latestDeckVersion: number | null;
  latestDeckStatus: string | null;
  daysUntilMeeting: number | null;
  daysSinceLastEmail: number | null;
  reminderMilestone: string | null;
  attention: AttentionItem[];
  health: HealthLevel;
}

export interface DashboardAggregates {
  total: number;
  active: number;
  needsVpReview: number;
  meetingsThisWeek: number;
  openMissingInfo: number;
  unconfirmedMetrics: number;
  highAttention: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  actorEmail: string | null;
  createdAt: string;
}

export interface EmailHealth {
  provider: string;
  configured: boolean;
  connected: boolean;
  email: string | null;
}

export type AttentionFilter = "all" | "needs_attention" | "vp_review" | "meeting_this_week";

const CLOSED_STATUSES = new Set(["CLOSED", "SURVEY_SENT", "PRESENTED"]);

type RawCycle = {
  id: string;
  quarter: string;
  year: number;
  status: string;
  meetingDate: Date | null;
  account: {
    clientName: string;
    region: string | null;
    vpOwner: PersonRef | null;
    director: PersonRef | null;
    accountManager: PersonRef | null;
  };
  missingInfoRequests: { id: string }[];
  dashboardMetrics: { isConfirmed: boolean; value: string | null }[];
  deckVersions: { versionNumber: number; status: string }[];
  approvals: { status: string }[];
  emailThreads: { messages: { receivedAt: Date }[] }[];
};

export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysSince(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const past = new Date(d);
  past.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - past.getTime()) / (1000 * 60 * 60 * 24));
}

/** Map days-until-meeting to the reminder cadence milestone. */
export function reminderMilestone(days: number | null, locale?: Locale): string | null {
  if (days === null) return null;
  const m = getStrings(locale).dashboard.milestones;
  if (days < 0) return m.postMeeting;
  if (days <= 4) return m.finalReview;
  if (days <= 14) return m.draftDue;
  if (days <= 30) return m.vpPrep;
  if (days <= 45) return m.metricsCollection;
  if (days <= 60) return m.directorCheckin;
  return m.earlyCycle;
}

function lastEmailAt(cycle: RawCycle): Date | null {
  let latest: Date | null = null;
  for (const thread of cycle.emailThreads) {
    for (const msg of thread.messages) {
      if (!latest || msg.receivedAt > latest) latest = msg.receivedAt;
    }
  }
  return latest;
}

function countUnconfirmed(metrics: RawCycle["dashboardMetrics"]): number {
  return metrics.filter((m) => !m.isConfirmed || m.value === TO_CONFIRM).length;
}

export function buildAttention(
  cycle: RawCycle,
  days: number | null,
  staleDays: number | null,
  locale?: Locale,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const t = getStrings(locale).dashboard.attentionLabels;
  const vpApproved = cycle.approvals.some((a) => a.status === "approved");
  const hasDraft = cycle.deckVersions.length > 0;
  const openMissing = cycle.missingInfoRequests.length;
  const unconfirmed = countUnconfirmed(cycle.dashboardMetrics);
  const isClosed = CLOSED_STATUSES.has(cycle.status);

  if (!isClosed && hasDraft && !vpApproved) {
    items.push({ kind: "vp_review", label: t.vp_review, severity: "high" });
  }
  if (openMissing > 0) {
    items.push({
      kind: "missing_info",
      label: t.missingInfo(openMissing),
      severity: openMissing >= 3 ? "high" : "medium",
    });
  }
  if (unconfirmed > 0) {
    items.push({
      kind: "unconfirmed_metrics",
      label: t.unconfirmedMetrics(unconfirmed),
      severity: unconfirmed >= 3 ? "medium" : "low",
    });
  }
  if (days !== null && days >= 0 && days <= 14 && !isClosed) {
    items.push({
      kind: "meeting_soon",
      label: days === 0 ? t.meetingToday : t.meetingInDays(days),
      severity: days <= 7 ? "high" : "medium",
    });
  }
  if (days !== null && days >= 0 && days <= 30 && !hasDraft && !isClosed) {
    items.push({ kind: "no_draft", label: t.noDraft, severity: days <= 14 ? "high" : "medium" });
  }
  if (days !== null && days < 0 && !isClosed) {
    items.push({ kind: "meeting_overdue", label: t.meetingOverdue, severity: "high" });
  }
  if (staleDays !== null && staleDays >= 14 && !isClosed) {
    items.push({
      kind: "stale",
      label: t.stale(staleDays),
      severity: staleDays >= 21 ? "medium" : "low",
    });
  }

  const rank: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function computeHealth(
  attention: AttentionItem[],
  status: string,
): HealthLevel {
  if (CLOSED_STATUSES.has(status)) return "neutral";
  if (attention.some((a) => a.severity === "high")) return "red";
  if (attention.some((a) => a.severity === "medium")) return "amber";
  if (attention.length) return "amber";
  return "green";
}

export function toDashboardCycle(cycle: RawCycle, locale?: Locale): DashboardCycle {
  const days = daysUntil(cycle.meetingDate);
  const lastEmail = lastEmailAt(cycle);
  const stale = lastEmail ? daysSince(lastEmail) : null;
  const attention = buildAttention(cycle, days, stale, locale);

  const latest = cycle.deckVersions[0] ?? null;

  return {
    id: cycle.id,
    clientName: cycle.account.clientName,
    quarter: cycle.quarter,
    year: cycle.year,
    status: cycle.status,
    meetingDate: cycle.meetingDate?.toISOString() ?? null,
    region: cycle.account.region,
    vpOwner: cycle.account.vpOwner,
    director: cycle.account.director,
    accountManager: cycle.account.accountManager,
    openMissingInfo: cycle.missingInfoRequests.length,
    unconfirmedMetrics: countUnconfirmed(cycle.dashboardMetrics),
    vpApproved: cycle.approvals.some((a) => a.status === "approved"),
    hasDraft: cycle.deckVersions.length > 0,
    latestDeckVersion: latest?.versionNumber ?? null,
    latestDeckStatus: latest?.status ?? null,
    daysUntilMeeting: days,
    daysSinceLastEmail: stale,
    reminderMilestone: reminderMilestone(days, locale),
    attention,
    health: computeHealth(attention, cycle.status),
  };
}

export function buildAggregates(cycles: DashboardCycle[]): DashboardAggregates {
  const active = cycles.filter((c) => !CLOSED_STATUSES.has(c.status));
  return {
    total: cycles.length,
    active: active.length,
    needsVpReview: active.filter((c) => c.hasDraft && !c.vpApproved).length,
    meetingsThisWeek: active.filter(
      (c) => c.daysUntilMeeting !== null && c.daysUntilMeeting >= 0 && c.daysUntilMeeting <= 7,
    ).length,
    openMissingInfo: active.reduce((n, c) => n + c.openMissingInfo, 0),
    unconfirmedMetrics: active.reduce((n, c) => n + c.unconfirmedMetrics, 0),
    highAttention: active.filter((c) => c.attention.some((a) => a.severity === "high")).length,
  };
}

export function filterCycles(
  cycles: DashboardCycle[],
  opts: {
    search: string;
    status: string;
    vpId: string;
    attention: AttentionFilter;
  },
): DashboardCycle[] {
  const q = opts.search.trim().toLowerCase();
  return cycles.filter((c) => {
    if (q && !c.clientName.toLowerCase().includes(q)) return false;
    if (opts.status && c.status !== opts.status) return false;
    if (opts.vpId && c.vpOwner?.id !== opts.vpId) return false;
    if (opts.attention === "needs_attention" && c.attention.length === 0) return false;
    if (opts.attention === "vp_review" && !(c.hasDraft && !c.vpApproved)) return false;
    if (
      opts.attention === "meeting_this_week" &&
      !(c.daysUntilMeeting !== null && c.daysUntilMeeting >= 0 && c.daysUntilMeeting <= 7)
    ) {
      return false;
    }
    return true;
  });
}

export function attentionQueue(cycles: DashboardCycle[]): DashboardCycle[] {
  return [...cycles]
    .filter((c) => c.attention.length > 0 && !CLOSED_STATUSES.has(c.status))
    .sort((a, b) => {
      const aHigh = a.attention.some((x) => x.severity === "high") ? 0 : 1;
      const bHigh = b.attention.some((x) => x.severity === "high") ? 0 : 1;
      if (aHigh !== bHigh) return aHigh - bHigh;
      const aDays = a.daysUntilMeeting ?? 999;
      const bDays = b.daysUntilMeeting ?? 999;
      return aDays - bDays;
    });
}

export function formatAuditAction(action: string): string {
  return action.replace(/\./g, " · ").replace(/_/g, " ");
}

const HEALTH_BORDER: Record<HealthLevel, string> = {
  red: "border-l-4 border-l-gdi-red",
  amber: "border-l-4 border-l-amber-500",
  green: "border-l-4 border-l-gdi-green",
  neutral: "border-l-4 border-l-slate-300",
};

export function healthBorderClass(health: HealthLevel): string {
  return HEALTH_BORDER[health];
}
