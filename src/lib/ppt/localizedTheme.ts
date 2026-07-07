import { DECK_THEME } from "./deckTheme";
import { getDeckStrings, toConfirmLabel, type Locale } from "../i18n";

/**
 * Returns DECK_THEME geometry with locale-specific text strings overlaid.
 * Used by the renderer and live preview so French/English decks stay in sync.
 */
export function localizedTheme(locale?: string | null) {
  const ds = getDeckStrings(locale);
  const confirm = toConfirmLabel(locale);
  const T = DECK_THEME;
  return {
    ...T,
    blurbs: ds.blurbs,
    toConfirm: confirm,
    title: {
      ...T.title,
      heading: { ...T.title.heading, text: ds.titleHeading },
    },
    agenda: {
      ...T.agenda,
      heading: ds.agendaHeading,
      headingCont: ds.agendaHeadingCont,
      fallbackItems: [...ds.agendaItems],
    },
    followUpsTable: {
      ...T.followUpsTable,
      heading: ds.followUpsHeading,
      headingCont: ds.followUpsHeadingCont,
      headers: [...ds.followUpsHeaders],
      emptyRow: [...ds.followUpsEmpty],
    },
    priorities: {
      ...T.priorities,
      heading: ds.prioritiesHeading,
      headingCont: ds.prioritiesHeadingCont,
      emptyText: ds.prioritiesEmpty,
    },
    dashboard: {
      ...T.dashboard,
      heading: ds.dashboardHeading,
      headingCont: ds.dashboardHeadingCont,
      groupTitles: { ...ds.dashboardGroups },
      emptyRow: { label: ds.dashboardEmptyLabel },
    },
    whatsNext: {
      ...T.whatsNext,
      heading: ds.whatsNextHeading,
      headingCont: ds.whatsNextHeadingCont,
      emptyText: ds.whatsNextEmpty,
    },
    questions: {
      ...T.questions,
      headingText: ds.questionsHeading,
      thanksText: ds.questionsThanks,
    },
  };
}

export type LocalizedTheme = ReturnType<typeof localizedTheme>;

/** Resolve locale from generate options. */
export function resolveRenderLocale(locale?: Locale | string | null): Locale {
  if (locale === "en" || locale === "fr") return locale;
  return "fr";
}
