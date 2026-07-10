import type { Locale } from "../constants";

/**
 * Localized copy for the orchestrator-generated parts of outbound emails
 * (intros, next-action instructions, the "no matching BR" reply). The agent's
 * conversational reply is localized by the model; this covers the deterministic
 * workflow text so a reply reads entirely in one language.
 */

interface EmailWorkflowStrings {
  startedQbr: (client: string, quarter: string, year: number) => string;
  draftAttached: (fileName: string) => string;
  draftReplyActions: string;
  currentDeckAttached: (fileName: string) => string;
  rebuildDeckActions: string[];
  noDeckGenerated: (fileName: string) => string;
  approvalRecorded: string;
  approvalNext: string;
  revisedDraftAttached: (fileName: string) => string;
  finalDeckAttached: (fileName: string) => string;
  finalizeNext: string[];
  finalizationBlocked: (reason: string) => string;
  finalizationBlockedNext: string;
  surveyQueued: string;
  surveyNext: string;
  noCycleAnswer: string;
  noCycleNext: string;
}

const STRINGS: Record<Locale, EmailWorkflowStrings> = {
  en: {
    startedQbr: (client, quarter, year) =>
      `Started the ${client} ${quarter} ${year} BR.`,
    draftAttached: (fileName) =>
      `Your draft is attached: ${fileName}. Use the live deck editor link below to tweak slides with the assistant.`,
    draftReplyActions:
      "Reply APPROVE, REVISE, or FINALIZE — or open the editor to make changes.",
    currentDeckAttached: (fileName) =>
      `Here's the current deck, attached: ${fileName}.`,
    rebuildDeckActions: [
      'Reply "rebuild the deck" to regenerate it with the latest captured data.',
      "Or open the live deck editor below to make changes.",
    ],
    noDeckGenerated: (fileName) =>
      `There wasn't a deck yet, so I generated one and attached it: ${fileName}.`,
    approvalRecorded: "Approval recorded.",
    approvalNext:
      "Reply FINALIZE to produce the final deck (required metrics must be confirmed or overridden).",
    revisedDraftAttached: (fileName) =>
      `Revised draft attached: ${fileName}. Keep refining it in the live deck editor below.`,
    finalDeckAttached: (fileName) => `Final deck attached: ${fileName}.`,
    finalizeNext: [
      "Client survey scheduled 24h after the meeting.",
      "Internal sentiment survey scheduled 24h after the meeting.",
    ],
    finalizationBlocked: (reason) => `Finalization blocked: ${reason}`,
    finalizationBlockedNext:
      "Confirm the unconfirmed metrics (or request an override), then reply FINALIZE.",
    surveyQueued: "I'll queue the client and internal sentiment surveys.",
    surveyNext: "Surveys will be sent to the client contacts on file.",
    noCycleAnswer:
      'I couldn\'t match your email to an existing BR. Tell me the client and quarter (e.g. "McGill Q1 2026"), or start one with subject: Start BR - <Client> - Q# YYYY.',
    noCycleNext:
      "Reply with the client name and quarter so I can pull up the right BR.",
  },
  fr: {
    startedQbr: (client, quarter, year) =>
      `Le BTR ${client} ${quarter} ${year} a été démarré.`,
    draftAttached: (fileName) =>
      `Votre ébauche est jointe : ${fileName}. Utilisez le lien de l'éditeur de présentation ci-dessous pour ajuster les diapositives avec l'assistant.`,
    draftReplyActions:
      "Répondez APPROUVER, RÉVISER ou FINALISER — ou ouvrez l'éditeur pour apporter des modifications.",
    currentDeckAttached: (fileName) =>
      `Voici la présentation actuelle, en pièce jointe : ${fileName}.`,
    rebuildDeckActions: [
      "Répondez « reconstruire la présentation » pour la régénérer avec les dernières données saisies.",
      "Ou ouvrez l'éditeur de présentation ci-dessous pour apporter des modifications.",
    ],
    noDeckGenerated: (fileName) =>
      `Il n'y avait pas encore de présentation, alors j'en ai généré une et l'ai jointe : ${fileName}.`,
    approvalRecorded: "Approbation enregistrée.",
    approvalNext:
      "Répondez FINALISER pour produire la présentation finale (les indicateurs requis doivent être confirmés ou remplacés).",
    revisedDraftAttached: (fileName) =>
      `Ébauche révisée jointe : ${fileName}. Continuez à la peaufiner dans l'éditeur de présentation ci-dessous.`,
    finalDeckAttached: (fileName) =>
      `Présentation finale jointe : ${fileName}.`,
    finalizeNext: [
      "Sondage client planifié 24 h après la rencontre.",
      "Sondage de satisfaction interne planifié 24 h après la rencontre.",
    ],
    finalizationBlocked: (reason) => `Finalisation bloquée : ${reason}`,
    finalizationBlockedNext:
      "Confirmez les indicateurs non confirmés (ou demandez un remplacement), puis répondez FINALISER.",
    surveyQueued:
      "Je vais mettre en file les sondages de satisfaction client et interne.",
    surveyNext: "Les sondages seront envoyés aux contacts client au dossier.",
    noCycleAnswer:
      "Je n'ai pas pu associer votre courriel à un BTR existant. Indiquez-moi le client et le trimestre (p. ex. « McGill T1 2026 »), ou démarrez-en un avec l'objet : Démarrer BTR - <Client> - T# AAAA.",
    noCycleNext:
      "Répondez avec le nom du client et le trimestre pour que je trouve le bon BTR.",
  },
};

export function getEmailStrings(
  locale: Locale | undefined,
): EmailWorkflowStrings {
  return STRINGS[locale ?? "en"] ?? STRINGS.en;
}
