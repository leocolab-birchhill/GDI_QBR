import type { SlideContent } from "../ai/schemas";
import { TO_CONFIRM } from "../constants";
import { getStrings, type EditorProgress, type GuidedSection, type Locale } from "../i18n";

export interface SectionGuidance {
  intro: string;
  missingFields: string[];
  /** Short suggestion chips the user can tap to pre-fill the chat input. */
  suggestions: string[];
}

function isUnconfirmed(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "to confirm" || v === "à confirmer" || v === "a confirmer";
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
