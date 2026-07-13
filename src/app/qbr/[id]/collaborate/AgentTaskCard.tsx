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

function quoted(value: unknown): string {
  return typeof value === "string" && value.trim() ? `“${value.trim()}”` : "";
}

function describeOperation(op: { type: string; [key: string]: unknown }, locale: Locale): string {
  const fr = locale === "fr";
  const title = quoted(op.title);
  const action = quoted(op.action);
  const label = quoted(op.label);
  const value = typeof op.value === "string" ? op.value : "";
  const descriptions: Record<string, string> = {
    set_metric: fr ? `Mettre ${label || "la mesure"} à ${value || "la nouvelle valeur"}` : `Set ${label || "the metric"} to ${value || "the new value"}`,
    remove_metric: fr ? `Supprimer la mesure ${label}` : `Remove metric ${label}`,
    add_priority: fr ? `Ajouter la priorité ${title}` : `Add priority ${title}`,
    reword_priority: fr ? `Reformuler la priorité ${title}` : `Reword priority ${title}`,
    remove_priority: fr ? `Supprimer la priorité ${title}` : `Remove priority ${title}`,
    add_upcoming: fr ? `Ajouter l’élément à venir ${title}` : `Add what’s-next item ${title}`,
    remove_upcoming: fr ? `Supprimer l’élément à venir ${title}` : `Remove what’s-next item ${title}`,
    add_commitment: fr ? `Ajouter le suivi ${action}` : `Add follow-up ${action}`,
    set_commitment_status: fr ? `Mettre à jour le statut du suivi ${action}` : `Update the status of follow-up ${action}`,
    remove_commitment: fr ? `Supprimer le suivi ${action}` : `Remove follow-up ${action}`,
    set_client_name: fr ? "Mettre à jour le nom du client" : "Update the client name",
    set_agenda: fr ? "Mettre à jour l’ordre du jour" : "Update the agenda",
    set_meeting_date: fr ? "Mettre à jour la date de la réunion" : "Update the meeting date",
    set_next_meeting_date: fr ? "Mettre à jour la date de la prochaine réunion" : "Update the next meeting date",
    add_slide: fr ? `Ajouter la diapositive ${title}` : `Add slide ${title}`,
    edit_slide: fr ? `Modifier la diapositive ${title}` : `Update slide ${title}`,
    remove_slide: fr ? `Supprimer la diapositive ${title}` : `Remove slide ${title}`,
    move_slide: fr ? `Déplacer la diapositive ${title}` : `Move slide ${title}`,
    set_section_hidden: op.hidden
      ? (fr ? `Masquer la section ${quoted(op.section)}` : `Hide section ${quoted(op.section)}`)
      : (fr ? `Afficher la section ${quoted(op.section)}` : `Show section ${quoted(op.section)}`),
    add_dashboard_group: fr ? `Ajouter le groupe de tableau de bord ${quoted(op.group)}` : `Add dashboard group ${quoted(op.group)}`,
    remove_dashboard_group: fr ? `Supprimer le groupe de tableau de bord ${quoted(op.group)}` : `Remove dashboard group ${quoted(op.group)}`,
    set_page_numbers: fr ? "Mettre à jour la numérotation des pages" : "Update page numbering",
    set_footer: fr ? "Mettre à jour le pied de page" : "Update the footer",
    set_title_tag: fr ? "Mettre à jour l’étiquette du titre" : "Update the title label",
    set_deck_option: fr ? "Mettre à jour les paramètres de la présentation" : "Update presentation settings",
  };
  return descriptions[op.type] || (fr ? "Mettre à jour la présentation" : "Update the presentation");
}

function describePatch(patch: { target: string; action?: string; [key: string]: unknown }, locale: Locale): string {
  const fr = locale === "fr";
  const set = patch.set && typeof patch.set === "object" ? patch.set as Record<string, unknown> : {};
  const match = patch.match && typeof patch.match === "object" ? patch.match as Record<string, unknown> : {};
  const name = quoted(set.title ?? set.section ?? set.group ?? match.title);

  if (patch.target === "deckLayout.customSlides") {
    if (patch.action === "add") return fr ? `Ajouter la diapositive ${name}` : `Add slide ${name}`;
    if (patch.action === "remove") return fr ? `Supprimer la diapositive ${name}` : `Remove slide ${name}`;
    return fr ? `Modifier la diapositive ${name}` : `Update slide ${name}`;
  }
  if (patch.target === "deckLayout.hiddenSections") {
    return patch.action === "add"
      ? (fr ? `Masquer la section ${name}` : `Hide section ${name}`)
      : (fr ? `Afficher la section ${name}` : `Show section ${name}`);
  }
  if (patch.target === "deckLayout.sectionOrder") return fr ? "Réorganiser les diapositives" : "Reorder the slides";
  if (patch.target === "deckLayout.hiddenDashboardGroups") {
    return patch.action === "add"
      ? (fr ? `Masquer le groupe de tableau de bord ${name}` : `Hide dashboard group ${name}`)
      : (fr ? `Afficher le groupe de tableau de bord ${name}` : `Show dashboard group ${name}`);
  }
  if (patch.target === "deckLayout.extraDashboardGroups") {
    if (patch.action === "remove") return fr ? `Supprimer le groupe de tableau de bord ${name}` : `Remove dashboard group ${name}`;
    if (patch.action === "update") return fr ? `Modifier le groupe de tableau de bord ${name}` : `Update dashboard group ${name}`;
    return fr ? `Ajouter un groupe au tableau de bord ${name}` : `Add a dashboard group ${name}`;
  }
  if (patch.target === "deckOptions") return fr ? "Mettre à jour les paramètres de la présentation" : "Update presentation settings";
  return fr ? "Mettre à jour la présentation" : "Update the presentation";
}

function displayValue(value: unknown, locale: Locale): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? (locale === "fr" ? "Oui" : "Yes") : (locale === "fr" ? "Non" : "No");
  if (Array.isArray(value)) return value.map((item) => displayValue(item, locale)).join(", ");
  if (typeof value === "object") return locale === "fr" ? "Mis à jour" : "Updated";
  return String(value);
}

function displayField(field: string, locale: Locale): string {
  if (!/[_\.]|[a-z][A-Z]/.test(field)) return field;
  const friendly = field
    .replace(/^deckLayout\./, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return locale === "fr" ? `Modification : ${friendly}` : friendly;
}

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
    ...(proposal.operations ?? []).map((op) => describeOperation(op, locale)),
    ...(proposal.patches ?? []).map((patch) => describePatch(patch, locale)),
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
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {operationSummary.map((summary, index) => <li key={`${summary}-${index}`}>{summary}</li>)}
          </ul>
        </div>
      )}
      <dl className="mt-2 space-y-1.5">
        {proposal.fieldChanges.map((change, index) => (
          <div key={`${change.field}-${index}`} className="grid grid-cols-[minmax(90px,0.7fr)_1fr] gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
            <dt className="font-medium">{displayField(change.field, locale)}</dt>
            <dd>
              {change.before != null && <span className="text-muted-foreground line-through">{displayValue(change.before, locale)} </span>}
              <span className="font-medium">{displayValue(change.after, locale)}</span>
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
