"use client";

import React, { type ReactNode } from "react";
import type { SectionReviewSummary } from "@/lib/qbr/sectionGuidance";
import { getStrings, type Locale } from "@/lib/i18n";
import type { AgentStage, ProposalView } from "./useAgentProposal";

const STAGE_COPY: Record<Exclude<AgentStage, "idle">, { en: string; fr: string }> = {
  understanding: { en: "Understanding your answer", fr: "Analyse de votre réponse" },
  preparing: { en: "Preparing structured fields", fr: "Préparation des champs structurés" },
  checking_safety: { en: "Checking client-ready language", fr: "Vérification du langage client" },
  updating_deck: { en: "Updating the deck", fr: "Mise à jour de la présentation" },
  reviewing_slide: { en: "Reviewing the slide", fr: "Révision de la diapositive" },
};

export function StructuredAnswerFields({
  value,
  onChange,
  locale,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  disabled: boolean;
}) {
  const copy = getStrings(locale).editor.agentFlow;
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">
        {copy.answerNaturally}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={3}
        className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-xs"
        placeholder={locale === "fr" ? "Donnez les faits; l'agent préparera les champs à vérifier…" : "Share the facts; the agent will prepare fields for you to review…"}
      />
    </label>
  );
}

export function ChangeProposal({
  proposal,
  locale,
  busy,
  onAccept,
  onReject,
}: {
  proposal: ProposalView;
  locale: Locale;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const copy = getStrings(locale).editor.agentFlow;
  const unsafe = proposal.review && !proposal.review.isClientSafe;
  const statusLabel = proposal.status === "proposed"
    ? (locale === "fr" ? "En attente d’approbation" : "Pending approval")
    : proposal.status === "applied"
      ? (locale === "fr" ? "Acceptée" : "Accepted")
      : proposal.status === "rejected"
        ? (locale === "fr" ? "Rejetée" : "Rejected")
        : proposal.status;
  const operationSummary = [
    ...(proposal.operations ?? []).map((op) => op.type),
    ...(proposal.patches ?? []).map((patch) => `${patch.target}${patch.action ? `:${patch.action}` : ""}`),
  ];
  return (
    <div className="rounded-lg border-2 border-primary/25 bg-background p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{copy.proposedChange}</p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {statusLabel}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
            {Math.round(proposal.confidence * 100)}% {locale === "fr" ? "confiance" : "confidence"}
          </span>
        </div>
      </div>
      {proposal.explanation && <p className="mt-1 text-[11px] text-muted-foreground">{proposal.explanation}</p>}
      {operationSummary.length > 0 && (
        <div className="mt-2 rounded-md border bg-muted/20 px-2 py-1.5 text-[11px]">
          <p className="font-medium">{locale === "fr" ? "Actions proposées" : "Proposed actions"}</p>
          <p className="mt-0.5 text-muted-foreground">{operationSummary.join(", ")}</p>
        </div>
      )}
      <dl className="mt-2 space-y-1.5">
        {proposal.fieldChanges.map((change, index) => (
          <div key={`${change.field}-${index}`} className="grid grid-cols-[minmax(90px,0.7fr)_1fr] gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
            <dt className="font-medium">{change.field}</dt>
            <dd>
              {change.before != null && <span className="text-muted-foreground line-through">{String(change.before)} </span>}
              <span className="font-medium">{String(change.after ?? "—")}</span>
            </dd>
          </div>
        ))}
      </dl>
      {unsafe && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          <p className="font-semibold">{locale === "fr" ? "Révision client requise" : "Client-safety review required"}</p>
          <ul className="mt-1 list-disc pl-4">{proposal.review?.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          {proposal.review?.suggestedRewrite && <p className="mt-1">{proposal.review.suggestedRewrite}</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={onAccept} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {unsafe ? (locale === "fr" ? "Accepter malgré l'avertissement" : "Accept with warning") : copy.apply}
        </button>
        <button type="button" disabled={busy} onClick={onReject} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          {copy.reject}
        </button>
      </div>
    </div>
  );
}

export function AgentActivity({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const copy = getStrings(locale).editor.agentFlow;
  return (
    <details className="rounded-md border bg-muted/10">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
        {copy.activity}
      </summary>
      <div className="border-t">{children}</div>
    </details>
  );
}

export default function AgentTaskCard({
  review,
  locale,
  answer,
  onAnswerChange,
  onSubmit,
  onConfirmSection,
  onAcceptProposal,
  onRejectProposal,
  onUndo,
  proposal,
  stage,
  busy,
  children,
}: {
  review: SectionReviewSummary;
  locale: Locale;
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  onConfirmSection: () => void;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
  onUndo: () => void;
  proposal: ProposalView | null;
  stage: AgentStage;
  busy: boolean;
  children: ReactNode;
}) {
  const copy = getStrings(locale).editor.agentFlow;
  const task = review.nextTask;
  return (
    <section className="mt-2 rounded-xl border-2 border-primary/20 bg-primary/[0.035] p-3 shadow-sm" aria-labelledby="agent-task-title">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">A</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="agent-task-title" className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              {copy.nextStep}
            </p>
            <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium">
              {review.status === "complete" ? copy.complete :
                review.status === "ready" ? copy.ready : copy.needsInput}
            </span>
          </div>
          <h2 className="mt-1 text-sm font-semibold">{task?.question ?? (locale === "fr" ? "Cette diapositive est terminée." : "This slide is complete.")}</h2>
          {task?.rationale && <p className="mt-1 text-[11px] text-muted-foreground">{task.rationale}</p>}
        </div>
      </div>

      {stage !== "idle" && (
        <div className="mt-3 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
          {STAGE_COPY[stage][locale]}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {children}
        {!task?.complete && (
          <>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" />{locale === "fr" ? "ou" : "or"}<span className="h-px flex-1 bg-border" />
            </div>
            <StructuredAnswerFields value={answer} onChange={onAnswerChange} locale={locale} disabled={busy} />
            <button type="button" onClick={onSubmit} disabled={busy || !answer.trim()} className="rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50">
              {copy.prepareFields}
            </button>
          </>
        )}
        {proposal && <ChangeProposal proposal={proposal} locale={locale} busy={busy} onAccept={onAcceptProposal} onReject={onRejectProposal} />}
        {task?.complete && review.status !== "complete" && (
          <button type="button" onClick={onConfirmSection} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {locale === "fr" ? "Confirmer et continuer" : "Confirm & continue"}
          </button>
        )}
        <button type="button" onClick={onUndo} disabled={busy} className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50">
          {copy.undo}
        </button>
      </div>
    </section>
  );
}
