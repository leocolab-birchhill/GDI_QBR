"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type AttentionFilter,
  type AttentionItem,
  type AuditEntry,
  type DashboardAggregates,
  type DashboardCycle,
  type HealthLevel,
  attentionQueue,
  filterCycles,
  formatAuditAction,
  healthBorderClass,
} from "@/lib/qbr/dashboard";
import { formatDate } from "@/lib/utils";
import { QBR_STATUSES } from "@/lib/constants";
import { getStrings, type Locale } from "@/lib/i18n";

type DashStrings = ReturnType<typeof getStrings>["dashboard"];

const SEVERITY_DOT: Record<AttentionItem["severity"], string> = {
  high: "bg-gdi-red",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

function meetingCountdown(days: number | null, s: DashStrings): string {
  const c = s.countdown;
  if (days === null) return c.none;
  if (days < 0) return c.overdue(Math.abs(days));
  if (days === 0) return c.today;
  if (days === 1) return c.tomorrow;
  return c.away(days);
}

function countdownClass(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "font-semibold text-gdi-red";
  if (days <= 7) return "font-semibold text-amber-600";
  if (days <= 14) return "text-amber-600";
  return "text-muted-foreground";
}

function selectClass(): string {
  return "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary";
}

export default function DashboardView({
  cycles,
  aggregates,
  audit,
  locale,
}: {
  cycles: DashboardCycle[];
  aggregates: DashboardAggregates;
  audit: AuditEntry[];
  locale: Locale;
}) {
  const s = getStrings(locale).dashboard;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [vpId, setVpId] = useState("");
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>("all");

  const attentionFilters: { value: AttentionFilter; label: string }[] = [
    { value: "all", label: s.attentionFilters.all },
    { value: "needs_attention", label: s.attentionFilters.needs_attention },
    { value: "vp_review", label: s.attentionFilters.vp_review },
    { value: "meeting_this_week", label: s.attentionFilters.meeting_this_week },
  ];

  const vpOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cycles) {
      if (c.vpOwner) map.set(c.vpOwner.id, c.vpOwner.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cycles]);

  const filtered = useMemo(
    () => filterCycles(cycles, { search, status, vpId, attention: attentionFilter }),
    [cycles, search, status, vpId, attentionFilter],
  );

  const queue = useMemo(() => attentionQueue(filtered), [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <Image
            src="/brand/gdi-logo.png"
            alt="GDI"
            width={120}
            height={36}
            className="h-8 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{s.title}</h1>
            <p className="text-muted-foreground">{s.subtitle}</p>
          </div>
        </div>
      </div>

      <SummaryBar aggregates={aggregates} s={s} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{s.filters}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder={s.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${selectClass()} min-w-[180px]`}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass()}>
            <option value="">{s.allStatuses}</option>
            {QBR_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select value={vpId} onChange={(e) => setVpId(e.target.value)} className={selectClass()}>
            <option value="">{s.allVps}</option>
            {vpOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={attentionFilter}
            onChange={(e) => setAttentionFilter(e.target.value as AttentionFilter)}
            className={selectClass()}
          >
            {attentionFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {(search || status || vpId || attentionFilter !== "all") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("");
                setVpId("");
                setAttentionFilter("all");
              }}
            >
              {s.clearFilters}
            </Button>
          )}
        </CardContent>
      </Card>

      {queue.length > 0 && attentionFilter === "all" && !search && !status && !vpId && (
        <AttentionQueue cycles={queue.slice(0, 8)} s={s} />
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {s.noMatch}{" "}
            <button type="button" className="text-primary underline" onClick={() => setAttentionFilter("all")}>
              {s.showAll}
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <QbrCard key={c.id} cycle={c} s={s} />
          ))}
        </div>
      )}

      {audit.length > 0 && <RecentActivity entries={audit} s={s} locale={locale} />}
    </div>
  );
}

function SummaryBar({ aggregates, s }: { aggregates: DashboardAggregates; s: DashStrings }) {
  const stats = [
    { label: s.summary.active, value: aggregates.active, tone: "" },
    { label: s.summary.highPriority, value: aggregates.highAttention, tone: aggregates.highAttention ? "text-gdi-red" : "" },
    { label: s.summary.awaitingVp, value: aggregates.needsVpReview, tone: aggregates.needsVpReview ? "text-gdi-navy" : "" },
    { label: s.summary.meetingsThisWeek, value: aggregates.meetingsThisWeek, tone: aggregates.meetingsThisWeek ? "text-amber-600" : "" },
    { label: s.summary.openMissingInfo, value: aggregates.openMissingInfo, tone: aggregates.openMissingInfo ? "text-amber-600" : "" },
    { label: s.summary.unconfirmedMetrics, value: aggregates.unconfirmedMetrics, tone: aggregates.unconfirmedMetrics ? "text-amber-600" : "" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AttentionQueue({ cycles, s }: { cycles: DashboardCycle[]; s: DashStrings }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{s.attentionQueue}</CardTitle>
        <p className="text-sm text-muted-foreground">{s.attentionQueueHint}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {cycles.map((c) => (
          <Link
            key={c.id}
            href={`/qbr/${c.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <div className="flex min-w-0 items-center gap-2">
              <HealthDot health={c.health} />
              <span className="font-medium">{c.clientName}</span>
              <span className="text-muted-foreground">
                {c.quarter} {c.year}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.attention.slice(0, 2).map((a) => (
                <span key={a.kind} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[a.severity]}`} />
                  {a.label}
                </span>
              ))}
              <span className={countdownClass(c.daysUntilMeeting)}>{meetingCountdown(c.daysUntilMeeting, s)}</span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function HealthDot({ health }: { health: HealthLevel }) {
  const colors: Record<HealthLevel, string> = {
    red: "bg-gdi-red",
    amber: "bg-amber-500",
    green: "bg-gdi-green",
    neutral: "bg-slate-400",
  };
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors[health]}`} />;
}

function QbrCard({ cycle: c, s }: { cycle: DashboardCycle; s: DashStrings }) {
  const [vpBusy, setVpBusy] = useState(false);
  const [vpOn, setVpOn] = useState(c.vpApproved);
  const router = useRouter();

  useEffect(() => {
    setVpOn(c.vpApproved);
  }, [c.vpApproved]);

  async function toggleVp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (vpBusy || !c.hasDraft) return;
    setVpBusy(true);
    const next = !vpOn;
    try {
      const res = await fetch(`/api/qbr/${c.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next ? "approved" : "revision_requested",
          comments: next ? undefined : "Approval revoked from dashboard",
        }),
      });
      if (res.ok) {
        setVpOn(next);
        router.refresh();
      }
    } finally {
      setVpBusy(false);
    }
  }

  return (
    <Card className={`flex h-full flex-col transition-shadow hover:shadow-md ${healthBorderClass(c.health)}`}>
      <Link href={`/qbr/${c.id}`} className="flex flex-1 flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{c.clientName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {c.quarter} {c.year}
                {c.region ? ` · ${c.region}` : ""}
              </p>
            </div>
            <Badge status={c.status}>{c.status.replace(/_/g, " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">{s.meeting}</span>
            <span className={countdownClass(c.daysUntilMeeting)}>
              {formatDate(c.meetingDate)} · {meetingCountdown(c.daysUntilMeeting, s)}
            </span>
          </div>
          {c.reminderMilestone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{s.cadence}</span>
              <span className="text-xs">{c.reminderMilestone}</span>
            </div>
          )}
          {c.attention.length > 0 && (
            <ul className="space-y-1 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
              {c.attention.slice(0, 3).map((a) => (
                <li key={a.kind} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[a.severity]}`} />
                  {a.label}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto space-y-1 border-t pt-2">
            <Row label={s.missingInfo} value={String(c.openMissingInfo)} warn={c.openMissingInfo > 0} />
            <Row label={s.unconfirmedMetricsRow} value={String(c.unconfirmedMetrics)} warn={c.unconfirmedMetrics > 0} />
            <Row label={s.vpApproved} value={vpOn ? s.yes : s.no} warn={c.hasDraft && !vpOn} />
            <Row
              label={s.latestDeck}
              value={c.latestDeckVersion ? `v${c.latestDeckVersion} (${c.latestDeckStatus})` : "—"}
              warn={!c.hasDraft}
            />
            {c.daysSinceLastEmail !== null && (
              <Row label={s.lastEmail} value={s.daysAgo(c.daysSinceLastEmail)} warn={c.daysSinceLastEmail >= 14} />
            )}
          </div>
        </CardContent>
      </Link>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
        <Link
          href={`/qbr/${c.id}`}
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-accent"
        >
          {s.workspace}
        </Link>
        <Link
          href={`/qbr/${c.id}/collaborate`}
          className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          {s.deckEditor}
        </Link>
        <button
          type="button"
          disabled={vpBusy || !c.hasDraft}
          onClick={toggleVp}
          aria-pressed={vpOn}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            vpOn
              ? "border-gdi-green bg-gdi-green text-white hover:bg-gdi-green/90"
              : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
          }`}
          title={vpOn ? "VP on — click to revoke" : "VP off — click to approve"}
        >
          <span
            className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] ${
              vpOn ? "bg-white/25" : "bg-amber-200"
            }`}
          >
            {vpBusy ? "…" : vpOn ? "✓" : ""}
          </span>
          VP
        </button>
      </div>
    </Card>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={warn ? "font-semibold text-amber-600" : ""}>{value}</span>
    </div>
  );
}

function RecentActivity({ entries, s, locale }: { entries: AuditEntry[]; s: DashStrings; locale: Locale }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{s.recentActivity}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed pb-2 last:border-0">
              <span>
                <span className="font-medium">{formatAuditAction(e.action)}</span>
                <span className="text-muted-foreground"> · {e.entityType}</span>
                {e.actorEmail && <span className="text-muted-foreground"> · {e.actorEmail}</span>}
              </span>
              <time className="text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString(locale === "fr" ? "fr-CA" : "en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
