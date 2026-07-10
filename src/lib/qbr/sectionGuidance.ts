import type { SlideContent } from "../ai/schemas";
import { TO_CONFIRM } from "../constants";
import { getStrings, type EditorProgress, type GuidedSection, type Locale } from "../i18n";

export interface SectionGuidance {
  intro: string;
  missingFields: string[];
  /** Short suggestion chips the user can tap to pre-fill the chat input. */
  suggestions: string[];
}

export type InterviewInputType = "text" | "date" | "list" | "metric" | "prose";
export type SectionReviewStatus = "needs_input" | "reviewing" | "ready" | "complete";

export interface InterviewField {
  key: string;
  label: string;
  inputType: InterviewInputType;
  required: boolean;
  validation?: { maxLength?: number; minItems?: number };
}

export interface InterviewTask {
  id: string;
  section: GuidedSection;
  question: string;
  rationale: string;
  fields: InterviewField[];
  priority: number;
  complete: boolean;
}

export interface SectionReviewSummary {
  status: SectionReviewStatus;
  missing: string[];
  unconfirmed: string[];
  warnings: string[];
  nextTask: InterviewTask | null;
}

function isUnconfirmed(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "to confirm" || v === "à confirmer" || v === "a confirmer";
}

function taskCopy(section: GuidedSection, locale?: Locale | null) {
  const fr = locale === "fr";
  const copy: Record<GuidedSection, { question: string; rationale: string; field: InterviewField }> = {
    title: {
      question: fr ? "Quand cette revue aura-t-elle lieu?" : "When will this review take place?",
      rationale: fr ? "La date ancre la page titre et le calendrier de suivi." : "The date anchors the title slide and follow-up schedule.",
      field: { key: "title.meetingDate", label: fr ? "Date de réunion" : "Meeting date", inputType: "date", required: true },
    },
    agenda: {
      question: fr ? "Quels sujets devons-nous couvrir avec le client?" : "What should we cover with the client?",
      rationale: fr ? "L'ordre du jour doit refléter les décisions attendues." : "The agenda should reflect the decisions expected from the meeting.",
      field: { key: "agenda", label: fr ? "Sections de l'ordre du jour" : "Agenda sections", inputType: "list", required: true, validation: { minItems: 1 } },
    },
    followUps: {
      question: fr ? "Quel engagement devons-nous clarifier ensuite?" : "Which follow-up should we clarify next?",
      rationale: fr ? "Chaque engagement doit avoir un responsable et une échéance." : "Every commitment needs an accountable owner and due date.",
      field: { key: "followUps", label: fr ? "Engagements" : "Follow-ups", inputType: "list", required: true, validation: { minItems: 1 } },
    },
    priorities: {
      question: fr ? "Quelles sont les 2 ou 3 priorités à discuter?" : "What are the 2–3 priorities to discuss?",
      rationale: fr ? "Une courte liste garde la conversation orientée vers les décisions." : "A short list keeps the conversation focused on decisions.",
      field: { key: "priorityItems", label: fr ? "Priorités" : "Priority items", inputType: "prose", required: true, validation: { minItems: 2, maxLength: 240 } },
    },
    dashboard: {
      question: fr ? "Quelle mesure manque ou doit être confirmée?" : "Which metric is missing or still needs confirmation?",
      rationale: fr ? "Les mesures restent structurées pour éviter toute valeur inventée." : "Metrics remain structured so no value is inferred or invented.",
      field: { key: "dashboard.metrics", label: fr ? "Mesures du tableau de bord" : "Dashboard metrics", inputType: "metric", required: true },
    },
    whatsNext: {
      question: fr ? "Qu'est-ce qui s'en vient avant la prochaine revue?" : "What is coming up before the next review?",
      rationale: fr ? "Les prochaines étapes donnent au client une vue claire de la suite." : "Upcoming items give the client a clear view of what happens next.",
      field: { key: "whatsNext", label: fr ? "Éléments à venir" : "Upcoming items", inputType: "prose", required: true, validation: { minItems: 1, maxLength: 240 } },
    },
    questions: {
      question: fr ? "Le message de clôture est-il prêt pour le client?" : "Is the closing message ready for the client?",
      rationale: fr ? "Une dernière vérification confirme le ton et la prochaine action." : "A final check confirms the tone and next action.",
      field: { key: "deckOptions.footerText", label: fr ? "Message de clôture" : "Closing message", inputType: "prose", required: false, validation: { maxLength: 180 } },
    },
  };
  return copy[section];
}

/** Deterministic interview state. AI can phrase or extract answers, but never controls completeness. */
export function getSectionReview(
  section: GuidedSection,
  content: SlideContent | null,
  progress: EditorProgress,
  locale?: Locale | null,
): SectionReviewSummary {
  const guidance = getSectionGuidance(section, content, progress, locale);
  const confirmed = progress.confirmedSections.includes(section);
  const unconfirmed = guidance.missingFields.filter((field) =>
    /owner|responsable|due date|échéance|detail|détail|explanation|explication/i.test(field),
  );
  const warnings: string[] = [];
  if ((section === "priorities" && (content?.priorityItems.length ?? 0) > 3) ||
      (section === "whatsNext" && (content?.whatsNext.length ?? 0) > 5)) {
    warnings.push(locale === "fr" ? "Le contenu risque d'être trop dense pour la diapositive." : "Content may be too dense for the slide.");
  }

  const missing = guidance.missingFields.filter((field) => !unconfirmed.includes(field));
  const copy = taskCopy(section, locale);
  const firstGap = guidance.missingFields[0] ?? "";
  let question = copy.question;
  let field = copy.field;
  if (section === "title" && /client|nom du client/i.test(firstGap)) {
    question = locale === "fr" ? "Quel nom de client doit apparaître sur la présentation?" : "What client name should appear on the deck?";
    field = { key: "title.clientName", label: locale === "fr" ? "Nom du client" : "Client name", inputType: "text", required: true };
  } else if (section === "dashboard" && firstGap) {
    question = locale === "fr" ? `Quelle est la valeur confirmée pour « ${firstGap} »?` : `What is the confirmed value for “${firstGap}”?`;
    field = { key: `dashboard.metrics.${firstGap}`, label: firstGap, inputType: "metric", required: true };
  } else if (section === "followUps" && firstGap) {
    question = locale === "fr" ? `Pouvez-vous confirmer : ${firstGap}?` : `Can you confirm: ${firstGap}?`;
  }
  const complete = missing.length === 0 && unconfirmed.length === 0;
  const nextTask: InterviewTask | null = confirmed && complete
    ? null
    : {
        id: `${section}:${guidance.missingFields[0] ?? "review"}`,
        section,
        question: complete
          ? locale === "fr" ? `La diapositive ${getStrings(locale).editor.sections[section]} est prête. Voulez-vous la confirmer?` : `${getStrings(locale).editor.sections[section]} is ready. Would you like to confirm it?`
          : question,
        rationale: copy.rationale,
        fields: complete ? [] : [field],
        priority: complete ? 10 : 100,
        complete,
      };

  return {
    status: confirmed ? "complete" : complete ? "ready" : "needs_input",
    missing,
    unconfirmed,
    warnings,
    nextTask,
  };
}

/** Deterministic per-slide guidance — no API call, instant on section switch. */
export function getSectionGuidance(
  section: GuidedSection,
  content: SlideContent | null,
  progress: EditorProgress,
  locale?: Locale | null,
): SectionGuidance {
  const s = getStrings(locale);
  const confirm = s.toConfirm;
  const missing: string[] = [];
  const suggestions: string[] = [...(s.editor.suggestionChips[section] ?? [])];

  const sectionLabel = s.editor.sections[section];
  const prompt = s.editor.prompts[section];
  const confirmed = progress.confirmedSections.includes(section);
  const intro = confirmed
    ? locale === "fr"
      ? `**${sectionLabel}** — diapositive confirmée. Vous pouvez encore la modifier ci-dessous ou via le clavardage.`
      : `**${sectionLabel}** — slide marked complete. You can still edit below or via chat.`
    : `**${sectionLabel}**\n\n${prompt}`;

  if (!content) {
    return { intro, missingFields: missing, suggestions };
  }

  switch (section) {
    case "title": {
      if (!content.title.clientName?.trim()) missing.push(locale === "fr" ? "Nom du client" : "Client name");
      if (!content.title.meetingMonthYear?.trim()) missing.push(locale === "fr" ? "Date de réunion" : "Meeting date");
      break;
    }
    case "agenda": {
      if (content.agenda.length === 0) missing.push(locale === "fr" ? "Sections de l'ordre du jour" : "Agenda sections");
      break;
    }
    case "followUps": {
      if (content.followUps.length === 0) {
        missing.push(locale === "fr" ? "Au moins un engagement" : "At least one follow-up");
      } else {
        for (const f of content.followUps) {
          if (isUnconfirmed(f.owner)) missing.push(`${locale === "fr" ? "Responsable" : "Owner"}: ${f.action.slice(0, 40)}`);
          if (isUnconfirmed(f.dueDate)) missing.push(`${locale === "fr" ? "Échéance" : "Due date"}: ${f.action.slice(0, 40)}`);
        }
      }
      break;
    }
    case "priorities": {
      if (content.priorityItems.length === 0) {
        missing.push(locale === "fr" ? "2–3 éléments prioritaires" : "2–3 priority items");
      } else {
        for (const p of content.priorityItems) {
          if (isUnconfirmed(p.explanation)) missing.push(`${locale === "fr" ? "Explication" : "Explanation"}: ${p.title}`);
        }
      }
      break;
    }
    case "dashboard": {
      const groups = [
        ...content.dashboard.healthAndSafety,
        ...content.dashboard.operational,
        ...content.dashboard.financial,
        ...(content.dashboard.customGroups ?? []).flatMap((g) => g.rows),
      ];
      const hidden = new Set((content.dashboard.hiddenGroups ?? []).map((g) => g.toLowerCase()));
      if (hidden.size >= 3) {
        missing.push(locale === "fr" ? "Sections du tableau de bord visibles" : "Visible dashboard sections");
      }
      for (const m of groups) {
        if (isUnconfirmed(m.value)) missing.push(m.label);
      }
      if (groups.length === 0) missing.push(locale === "fr" ? "Indicateurs du tableau de bord" : "Dashboard metrics");
      break;
    }
    case "whatsNext": {
      if (content.whatsNext.length === 0) {
        missing.push(locale === "fr" ? "Éléments à venir" : "Upcoming items");
      } else {
        for (const u of content.whatsNext) {
          if (isUnconfirmed(u.detail)) missing.push(`${locale === "fr" ? "Détail" : "Detail"}: ${u.title}`);
        }
      }
      break;
    }
    case "questions":
      break;
  }

  // De-dupe missing field labels.
  const uniqueMissing = [...new Set(missing)].slice(0, 6);
  return { intro, missingFields: uniqueMissing, suggestions };
}

/** Contextual chat placeholder per guided section. */
export function sectionChatPlaceholder(section: GuidedSection, locale?: Locale | null): string {
  const s = getStrings(locale);
  const name = s.editor.sections[section];
  const hints: Partial<Record<GuidedSection, string>> =
    locale === "fr"
      ? {
          title: "Modifier le titre… (ex. « changer la date de réunion »)",
          agenda: "Modifier l'ordre du jour…",
          followUps: "Modifier les engagements…",
          priorities: "Modifier les priorités…",
          dashboard: "Modifier le tableau de bord… (ex. « retirer la section financière »)",
          whatsNext: "Modifier les prochaines étapes…",
          questions: "Note de clôture ou format…",
        }
      : {
          title: "Edit the title slide… (e.g. \"set meeting date to July 15\")",
          agenda: "Edit the agenda…",
          followUps: "Edit follow-ups…",
          priorities: "Edit priorities…",
          dashboard: "Edit the dashboard… (e.g. \"remove the financial section\")",
          whatsNext: "Edit what's next…",
          questions: "Closing note or deck format…",
        };
  return hints[section] ?? s.editor.slideChatPlaceholder.replace("this slide", name);
}

/** Pick the primary section tag for an assistant message from applied ops/patches. */
export function primarySectionForOps(
  opTypes: string[],
  activeSection?: string | null,
  patchTargets?: string[],
): string | null {
  if (activeSection) return activeSection;
  if (patchTargets?.length) {
    for (const t of patchTargets) {
      if (t === "deckLayout.customSlides") return activeSection ?? "agenda";
      if (t.includes("dashboard")) return "dashboard";
      if (t === "deckLayout.hiddenSections") return "agenda";
      if (t === "deckLayout.sectionOrder") return "agenda";
    }
  }
  const fromOps = opTypes
    .map((t) => {
      const map: Record<string, string> = {
        set_metric: "dashboard",
        remove_metric: "dashboard",
        add_dashboard_group: "dashboard",
        remove_dashboard_group: "dashboard",
        add_priority: "priorities",
        reword_priority: "priorities",
        remove_priority: "priorities",
        add_upcoming: "whatsNext",
        remove_upcoming: "whatsNext",
        add_commitment: "followUps",
        set_commitment_status: "followUps",
        remove_commitment: "followUps",
        set_client_name: "title",
        set_agenda: "agenda",
        set_meeting_date: "title",
        set_next_meeting_date: "title",
        add_slide: "agenda",
        edit_slide: "agenda",
        remove_slide: "agenda",
        move_slide: "agenda",
        set_section_hidden: "agenda",
      };
      return map[t];
    })
    .filter(Boolean);
  return fromOps[0] ?? null;
}
