/**
 * Rich editor context for the slide-editing agent: content rows plus full deck
 * layout and presentation metadata so the model can patch structure directly.
 */

import type { CustomSlide } from "../ai/schemas";
import { type DeckSnapshot } from "./answer";
import { buildAnswerContext } from "./answerContext";
import { readDeckLayout, type DeckLayout } from "./deckLayout";
import { readDeckOptions, getQbrFull } from "./service";
import type { EditorProgress } from "../i18n";

type FullQbr = NonNullable<Awaited<ReturnType<typeof getQbrFull>>>;

export interface GuidedEditContext {
  inputSource?: "activity_chat" | "guided_answer";
  activeSection?: string | null;
  guidedTask?: {
    id: string;
    section: string;
    question: string;
    rationale?: string;
    fields?: Array<{ key: string; label: string; inputType: string; required?: boolean; validation?: unknown }>;
    priority?: number;
    complete?: boolean;
  } | null;
  editorProgress?: EditorProgress;
}

export interface EditorContext {
  /** Content rows (metrics, priorities, etc.) — same as AnswerContext. */
  clientName: string;
  quarter: string;
  year: number;
  status: string;
  meetingDate?: string | null;
  nextMeetingDate?: string | null;
  previousQbrNotes?: string | null;
  commitments: { action: string; status: string; owner: string | null }[];
  priorities: { id?: string; title: string; explanation?: string | null; sortOrder?: number | null }[];
  metrics: { group: string; label: string; value: string | null; isConfirmed: boolean }[];
  upcomingItems: { id?: string; title: string; detail?: string | null; sortOrder?: number | null }[];
  missingInfo: { field: string; question: string; status: string }[];
  approvals: { status: string; approverEmail: string }[];
  deckVersions: { versionNumber: number; status: string }[];
  latestDeck?: DeckSnapshot | null;
  recentEmails: { direction: string; subject: string | null }[];
  /** Full deck structure blob (custom slides, hidden sections, order). */
  deckLayout: DeckLayout;
  /** Deck-wide presentation options (page numbers, footer, title tag, etc.). */
  deckOptions: Record<string, unknown>;
  /** Compact slide metadata the model can patch against. */
  requestContext?: GuidedEditContext;
  slides: {
    customSlides: CustomSlide[];
    hiddenSections: string[];
    sectionOrder: string[];
    hiddenDashboardGroups: string[];
    extraDashboardGroups: string[];
  };
}

/** Flatten a full QBR into the context consumed by editSlides(). */
export function buildEditorContext(full: FullQbr, requestContext?: GuidedEditContext): EditorContext {
  const base = buildAnswerContext(full);
  const deckLayout = readDeckLayout(full.deckLayoutJson);
  const deckOptions = readDeckOptions(full.deckOptionsJson);

  return {
    ...base,
    priorities: full.priorityItems.map((p) => ({
      id: p.id,
      title: p.title,
      explanation: p.clientReadyText ?? p.rawInput ?? null,
      sortOrder: p.sortOrder,
    })),
    upcomingItems: full.upcomingItems.map((u) => ({
      id: u.id,
      title: u.title,
      detail: u.clientReadyText ?? u.rawInput ?? null,
      sortOrder: u.sortOrder,
    })),
    requestContext,
    deckLayout,
    deckOptions,
    slides: {
      customSlides: deckLayout.customSlides,
      hiddenSections: deckLayout.hiddenSections,
      sectionOrder: deckLayout.sectionOrder,
      hiddenDashboardGroups: deckLayout.hiddenDashboardGroups,
      extraDashboardGroups: deckLayout.extraDashboardGroups,
    },
  };
}
