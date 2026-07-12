/**
 * Adapter that flattens a full QBR (Prisma) into the serializable AnswerContext
 * consumed by the agent answer mode (LLM + deterministic fallback). Kept apart
 * from answer.ts so that module stays pure/DB-free and easy to unit test.
 */

import { AnswerContext, DeckSnapshot } from "./answer";
import { getQbrFull } from "./service";

type FullQbr = NonNullable<Awaited<ReturnType<typeof getQbrFull>>>;
type DeckRow = FullQbr["deckVersions"][number];

export function buildAnswerContext(full: FullQbr): AnswerContext {
  const recentEmails = full.emailThreads
    .flatMap((t) => t.messages)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
    .slice(-8)
    .map((m) => ({ direction: m.direction, subject: m.subject }));

  return {
    clientName: full.account.clientName,
    quarter: full.quarter,
    year: full.year,
    status: full.status,
    meetingDate: full.meetingDate ? full.meetingDate.toISOString() : null,
    nextMeetingDate: full.nextMeetingDate ? full.nextMeetingDate.toISOString() : null,
    previousQbrNotes: full.previousQbrNotes ?? null,
    commitments: full.commitments.map((c) => ({ action: c.action, status: c.status, owner: c.owner })),
    priorities: full.priorityItems.map((p) => ({ title: p.title })),
    metrics: full.dashboardMetrics.map((m) => ({
      group: m.group,
      label: m.label,
      value: m.value,
      isConfirmed: m.isConfirmed,
    })),
    upcomingItems: full.upcomingItems.map((u) => ({ title: u.title })),
    missingInfo: full.missingInfoRequests.map((m) => ({
      field: m.field,
      question: m.question,
      status: m.status,
    })),
    approvals: full.approvals.map((a) => ({ status: a.status, approverEmail: a.approverEmail })),
    deckVersions: full.deckVersions.map((d) => ({ versionNumber: d.versionNumber, status: d.status })),
    latestDeck: pickLatestDeck(full.deckVersions),
    recentEmails,
  };
}

/**
 * Choose the deck that best represents "the last presentation": the most recent
 * FINAL deck if one exists, otherwise the most recent draft. Parses its stored
 * content snapshot into a compact summary the assistant can quote from.
 */
function pickLatestDeck(decks: DeckRow[]): DeckSnapshot | null {
  if (!decks.length) return null;
  const byVersionDesc = [...decks].sort((a, b) => b.versionNumber - a.versionNumber);
  const chosen = byVersionDesc.find((d) => d.status === "final") ?? byVersionDesc[0];
  return toSnapshot(chosen);
}

function toSnapshot(deck: DeckRow): DeckSnapshot {
  const base: DeckSnapshot = {
    versionNumber: deck.versionNumber,
    status: deck.status,
    isFinal: deck.status === "final",
    title: deck.title ?? null,
    generatedAt: deck.createdAt ? deck.createdAt.toISOString() : null,
    priorities: [],
    agenda: [],
    metrics: [],
    whatsNext: [],
  };
  if (!deck.contentJson) return base;
  try {
    const c = JSON.parse(deck.contentJson);
    base.priorities = (c.priorityItems ?? []).map((p: any) => p.title).filter(Boolean);
    base.agenda = (c.agenda ?? []).filter((item: any) => typeof item === "string" && item.trim());
    base.whatsNext = (c.whatsNext ?? []).map((w: any) => w.title).filter(Boolean);
    const d = c.dashboard ?? {};
    base.metrics = [...(d.healthAndSafety ?? []), ...(d.operational ?? []), ...(d.financial ?? [])]
      .filter((m: any) => m && m.label)
      .map((m: any) => ({ label: m.label, value: m.value ?? "" }));
  } catch {
    // Snapshot unparseable — keep the metadata-only summary.
  }
  return base;
}
