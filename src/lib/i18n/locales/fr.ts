/** French (fr-CA) strings — default for Quebec launch. */
export const fr = {
  locale: "fr" as const,
  localeTag: "fr-CA",
  toConfirm: "À confirmer",
  deck: {
    titleHeading: "Revue d’affaires",
    agendaHeading: "ORDRE DU JOUR",
    agendaHeadingCont: "ORDRE DU JOUR (suite)",
    agendaItems: [
      "SUIVI DES ENGAGEMENTS ET PROGRÈS",
      "ÉLÉMENTS PRIORITAIRES",
      "TABLEAU DE BORD",
      "PROCHAINES ÉTAPES",
      "QUESTIONS ET DISCUSSION",
    ],
    followUpsHeading: "SUIVI DES ENGAGEMENTS ET PROGRÈS",
    followUpsHeadingCont: "SUIVI DES ENGAGEMENTS ET PROGRÈS (suite)",
    followUpsHeaders: [
      "#",
      "Action convenue",
      "Statut",
      "Responsable",
      "Échéance",
    ],
    followUpsEmpty: ["—", "Aucun engagement en cours"],
    prioritiesHeading: "ÉLÉMENTS PRIORITAIRES",
    prioritiesHeadingCont: "ÉLÉMENTS PRIORITAIRES (suite)",
    prioritiesEmpty: "Éléments prioritaires à confirmer.",
    dashboardHeading: "TABLEAU DE BORD",
    dashboardHeadingCont: "TABLEAU DE BORD (suite)",
    dashboardGroups: {
      healthAndSafety: "Santé et sécurité",
      operational: "Opérationnel",
      financial: "Financier",
    },
    dashboardEmptyLabel: "À confirmer",
    whatsNextHeading: "PROCHAINES ÉTAPES",
    whatsNextHeadingCont: "PROCHAINES ÉTAPES (suite)",
    whatsNextEmpty: "Éléments à venir à confirmer.",
    questionsHeading: "DES QUESTIONS ?",
    questionsThanks: "Merci!",
    blurbs: {
      followUps:
        "Suivi des engagements pris lors de la dernière revue — actions convenues, responsables et progrès actuels.",
      priorities:
        "Les 2 à 3 éléments les plus importants affectant la relation et les opérations ce trimestre.",
      dashboard:
        "Santé du compte en un coup d'œil — indicateurs de santé et sécurité, opérationnels et financiers.",
      whatsNext:
        "Priorités et initiatives planifiées pour le prochain trimestre — prochaines étapes pour le compte.",
    },
  },
  editor: {
    welcome:
      "Bonjour! Je suis votre éditeur de présentation BR. Nous allons parcourir chaque diapositive ensemble. Décrivez vos modifications en langage courant et je mettrai à jour la présentation.\n\nPour commencer, confirmez les informations de la diapositive titre ou indiquez les changements souhaités.",
    guidedIntro: (section: string, prompt: string) =>
      `**Diapositive : ${section}**\n\n${prompt}\n\nVous pouvez ajouter, modifier, supprimer ou confirmer le contenu. Dites « confirmer » pour passer à la suivante.`,
    sections: {
      title: "Titre",
      agenda: "Ordre du jour",
      followUps: "Suivi des engagements",
      priorities: "Éléments prioritaires",
      dashboard: "Tableau de bord",
      whatsNext: "Prochaines étapes",
      questions: "Questions",
    },
    prompts: {
      title:
        "Vérifiez le nom du client, le trimestre et la date de la réunion. Souhaitez-vous modifier quelque chose?",
      agenda:
        "Souhaitez-vous ajouter, retirer ou réorganiser des sections de l'ordre du jour?",
      followUps:
        "Ajoutez, modifiez ou supprimez des engagements. Indiquez l'action, le statut, le responsable et l'échéance.",
      priorities:
        "Ajoutez ou modifiez les 2 à 3 éléments prioritaires de ce trimestre.",
      dashboard:
        "Ajoutez ou mettez à jour les indicateurs du tableau de bord (santé et sécurité, opérationnel, financier).",
      whatsNext: "Ajoutez les prochaines étapes et initiatives planifiées.",
      questions: "Confirmez cette diapositive de clôture ou ajoutez des notes.",
    },
    confirm: "Confirmer et continuer",
    confirmed: (section: string) => `✓ ${section} confirmé.`,
    allConfirmed:
      "Toutes les diapositives sont confirmées! Votre BR est prêt à être révisé ou téléchargé.",
    languageToggle: "English",
    languageLabel: "Français",
    siteLanguage: {
      label: "Langue du site",
      hint: "Interface, assistant et flux de travail",
      fr: "Français",
      en: "English",
    },
    deckLanguage: {
      label: "Langue de la présentation",
      hint: "Titres, ordre du jour et libellés du PowerPoint",
      fr: "Français",
      en: "English",
    },
    placeholder: "Décrivez vos modifications…",
    send: "Envoyer",
    revising: "Mise à jour de la présentation…",
    livePreview: "Aperçu en direct",
    slides: (n: number) => `${n} diapositives`,
    deckEditor: "Éditeur de présentation",
    collaborate: "Collaborez avec l'assistant pour réviser les diapositives",
    workspace: "← Espace de travail",
    latestDeck: (v: number) => `⬇ Dernière version (v${v})`,
    latestDeckVersion: (v: number) => `Dernière version : v${v}`,
    downloadLatestDeck: "Télécharger la dernière version",
    downloadDeck: (name: string, v: number) => `⬇ Télécharger ${name} (v${v})`,
    editingSlide: (current: number, total: number) =>
      `Modification de la diapositive ${current} sur ${total}`,
    slideTitles: {
      title: "Titre",
      agenda: "Ordre du jour",
      followUps: "Suivi des engagements et progrès",
      priorities: "Éléments prioritaires",
      dashboard: "Tableau de bord",
      whatsNext: "Prochaines étapes",
      questions: "Questions et discussion",
    },
    formTitles: {
      title: "Modifier la diapositive titre",
      agenda: "Modifier l'ordre du jour",
      followUps: "Modifier les engagements",
      priorities: "Modifier les priorités",
      dashboard: "Modifier le tableau de bord",
      whatsNext: "Modifier les prochaines étapes",
      questions: "Modifier la diapositive de clôture",
    },
    formHelpers: {
      title:
        "Mettez à jour le nom du client et les dates de réunion affichées sur la diapositive titre.",
      agenda:
        "Mettez à jour les sections de l'ordre du jour affichées sur cette diapositive.",
      followUps:
        "Mettez à jour les engagements affichés sur cette diapositive.",
      priorities:
        "Mettez à jour les éléments prioritaires affichés sur cette diapositive.",
      dashboard:
        "Mettez à jour les indicateurs du tableau de bord affichés sur cette diapositive.",
      whatsNext:
        "Mettez à jour les éléments à venir affichés sur cette diapositive.",
      questions:
        "Ajoutez une note de clôture optionnelle pour cette diapositive.",
    },
    slideStatus: {
      inProgress: "En cours",
      complete: "Complète",
      needsReview: "À vérifier",
    },
    saveSlideChanges: "Enregistrer les modifications",
    markSlideComplete: "Marquer comme complète",
    reopenSlideEditing: "Rouvrir la modification",
    resetChanges: "Réinitialiser",
    unsavedChanges: "Modifications non enregistrées",
    addFollowUp: "+ Ajouter un engagement",
    assistantSuggestions: "Suggestions de l'assistant",
    askAssistant: "Demander à l'assistant",
    askAssistantHelper:
      "Utilisez le clavardage pour les modifications groupées ou celles plus faciles à décrire en mots.",
    slideChatPlaceholder: "Décrivez une modification à cette diapositive…",
    chatHistory: "Historique du clavardage",
    tableColumns: {
      agreedAction: "Action convenue",
      status: "Statut",
      owner: "Responsable",
      dueDate: "Échéance",
      actions: "Actions",
    },
    removeRow: "Retirer",
    suggestionChips: {
      followUps: [
        "Ajouter 2 à 3 engagements prioritaires",
        "Définir les responsables manquants à « À confirmer »",
        "Définir les échéances manquantes à la prochaine BR",
        "Marquer les éléments complétés comme fermés",
      ],
      title: [
        "Changer la date de réunion à <date>",
        "Mettre à jour le nom du client à <nom>",
      ],
      agenda: [
        "Réorganiser l'ordre du jour pour que <section> précède <section>",
        "Retirer <section> de l'ordre du jour",
      ],
      priorities: [
        "Ajouter une priorité : <titre> - <pourquoi c'est important>",
        "Réécrire la priorité <nom> pour dire <nouvelle formulation>",
      ],
      dashboard: [
        "Définir <indicateur> à <valeur>",
        "Ajouter l'indicateur <indicateur> sous <groupe> avec la valeur <valeur>",
      ],
      whatsNext: [
        "Ajouter un élément : <titre> - <détail>",
        "Retirer l'élément à venir <nom>",
      ],
      questions: [
        "Ajouter une note de clôture : <note>",
        "Cette diapositive de clôture convient",
      ],
    },
    basicMode:
      "Mode édition de base. Aucune clé OpenAI configurée — l'éditeur utilise la correspondance par mots-clés. Configurez OPENAI_API_KEY pour l'édition en langage naturel.",
    capabilities: {
      title: "Que puis-je modifier ici?",
      can: "Vous pouvez",
      cant: "Vous ne pouvez pas",
      capacityNote:
        "Les diapositives se paginent automatiquement — environ 6 éléments d'ordre du jour et 7 éléments prioritaires / prochaines étapes par diapositive; les éléments en trop et les longs tableaux débordent sur de nouvelles diapositives.",
      canItems: [
        "Mettre à jour les indicateurs, priorités, prochaines étapes et engagements",
        "Ajouter ou retirer des éléments, reformuler le texte, changer le statut",
        "Masquer des diapositives intégrées, ajouter des diapositives personnalisées et masquer des sections du tableau de bord",
        "Définir les dates de réunion (cette BR et la suivante)",
        "Activer les numéros de page, le pied de page et une étiquette de titre",
      ],
      cantItems: [
        "Modifier les polices, couleurs, logos ou la mise en page",
        "Téléverser un .pptx personnalisé",
        "Inventer des chiffres — fournissez une valeur ou « À confirmer »",
      ],
    },
  },
  create: {
    title: "Créer un nouveau client / BR",
    subtitle:
      "Configurez un compte client et générez une présentation BR vierge.",
    clientName: "Nom du client",
    targetDate: "Date cible de la BR",
    quarter: "Trimestre",
    year: "Année",
    owners: "Propriétaire / parties prenantes",
    ownersHint: "Courriels séparés par des virgules",
    logo: "URL du logo (optionnel)",
    language: "Langue",
    languageFr: "Français",
    languageEn: "English",
    metadata: "Métadonnées (optionnel)",
    metadataHint: "Secteur, notes, etc.",
    submit: "Créer et générer la BR",
    existingClient: "Client existant",
    selectClient: "Sélectionner un client…",
    newBlankQbr: "Nouvelle BR vierge pour ce client",
    or: "ou",
    createNewClient: "Créer un nouveau client",
    success: (name: string, q: string, y: number) =>
      `BR vierge créée pour ${name} — ${q} ${y}. Redirection vers l'éditeur…`,
    error: "Erreur lors de la création. Veuillez réessayer.",
    wizard: {
      heading: "Démarrer une présentation BR",
      subtitle:
        "Sélectionnez un client existant ou créez-en un nouveau, puis ajoutez le logo du client avant d'ouvrir l'éditeur.",
      chooseClient: "Sélectionner un client",
      chooseClientHint: "Choisissez un compte existant.",
      newClientCta: "Créer un nouveau client",
      selectClientCta: "Sélectionner un client existant",
      actionTitle: "Que souhaitez-vous faire ?",
      openLastSaved: "Ouvrir la dernière BR enregistrée",
      openLastSavedHint: (q: string, y: number, v: number | null) =>
        v != null ? `${q} ${y} · dernière version v${v}` : `${q} ${y}`,
      generateFresh: "Générer une nouvelle BR",
      generateFreshHint:
        "Démarrer une nouvelle présentation vierge pour ce client.",
      noSavedQbr:
        "Aucune BR enregistrée pour ce client — nous en démarrerons une nouvelle.",
      freshQuarterLabel: "Trimestre de la nouvelle BR",
      quarterTaken: (client: string, q: string, y: number) =>
        `Une BR existe déjà pour ${client} ${q} ${y}. Ouvrez-la au lieu de créer un doublon.`,
      quarterAvailable: (q: string, y: number) =>
        `Aucune BR pour ${q} ${y} — une nouvelle présentation sera créée.`,
      openExisting: "Ouvrir cette BR",
      logoTitle: "Ajouter le logo du client",
      logoHint:
        "Optionnel. Le logo du client apparaît dans le bloc de co-marquage en haut à droite (logo client │ GDI) sur chaque diapositive et est enregistré au profil du client pour les prochaines présentations. PNG, JPG ou SVG, max. 5 Mo.",
      currentLogo: "Logo actuel",
      chooseFile: "Choisir une image…",
      uploading: "Téléversement…",
      skip: "Passer pour l'instant",
      continue: "Continuer",
      back: "Retour",
      opening: "Ouverture de l'éditeur…",
    },
  },
  email: {
    createdQbr: (client: string, q: string, y: number) =>
      `BR créée : ${client} ${q} ${y}.`,
    stillNeed: "Il me manque encore :",
    replyUnknown:
      "Répondez avec ce que vous savez. « Inconnu » est acceptable.",
    editorLink: "Ouvrir l'éditeur collaboratif",
    createClientSubject: "Nouveau client BR",
    createClientBody: (client: string) =>
      `Pour créer un nouveau client « ${client} », j'ai besoin de :\n1. Date cible de la BR\n2. Propriétaire / parties prenantes\n3. Trimestre et année\n\nRépondez avec ces informations ou utilisez l'éditeur collaboratif.`,
  },
  dashboard: {
    title: "Tableau de bord BR",
    subtitle:
      "Vue d'ensemble des opérations — ce qui requiert votre attention dans toutes les revues trimestrielles.",
    startViaEmail: "+ Démarrer une BR via le simulateur courriel",
    emptyTitle: "Tableau de bord BR",
    emptyState:
      "Aucune BR pour l'instant. Lancez le script d'amorçage ou utilisez le simulateur courriel.",
    filters: "Filtres",
    searchPlaceholder: "Rechercher un client…",
    allStatuses: "Tous les statuts",
    allVps: "Tous les VP",
    clearFilters: "Effacer les filtres",
    noMatch: "Aucune BR ne correspond à vos filtres.",
    showAll: "Tout afficher",
    attentionFilters: {
      all: "Toutes les BR",
      needs_attention: "Requiert attention",
      vp_review: "En attente du VP",
      meeting_this_week: "Réunion cette semaine",
    },
    summary: {
      active: "BR actives",
      highPriority: "Priorité élevée",
      awaitingVp: "En attente du VP",
      meetingsThisWeek: "Réunions cette semaine",
      openMissingInfo: "Infos manquantes ouvertes",
      unconfirmedMetrics: "Indicateurs non confirmés",
    },
    emailProvider: "Fournisseur courriel :",
    connected: (email: string) => `Connecté — ${email}`,
    mailboxNotConnected: "Boîte aux lettres non connectée",
    graphNotConfigured: "Identifiants Graph non configurés",
    connectMailbox: "Connecter la boîte aux lettres",
    attentionQueue: "File prioritaire",
    attentionQueueHint:
      "BR actives triées par urgence — traitez celles-ci en premier.",
    meeting: "Réunion",
    cadence: "Cadence",
    missingInfo: "Infos manquantes",
    unconfirmedMetricsRow: "Indicateurs non confirmés",
    vpApproved: "Approuvé par le VP",
    yes: "Oui",
    no: "Non",
    latestDeck: "Dernière présentation",
    lastEmail: "Dernier courriel",
    daysAgo: (n: number) => `il y a ${n} j`,
    workspace: "Espace de travail",
    deckEditor: "Éditeur de présentation",
    vpReview: "Révision VP",
    recentActivity: "Activité récente",
    countdown: {
      none: "Aucune date de réunion",
      overdue: (n: number) => `${n} j de retard`,
      today: "Aujourd'hui",
      tomorrow: "Demain",
      away: (n: number) => `dans ${n} j`,
    },
    attentionLabels: {
      vp_review: "En attente de l'approbation du VP",
      missingInfo: (n: number) =>
        `${n} information${n === 1 ? "" : "s"} manquante${n === 1 ? "" : "s"} ouverte${n === 1 ? "" : "s"}`,
      unconfirmedMetrics: (n: number) =>
        `${n} indicateur${n === 1 ? "" : "s"} non confirmé${n === 1 ? "" : "s"}`,
      meetingToday: "Réunion aujourd'hui",
      meetingInDays: (n: number) =>
        `Réunion dans ${n} jour${n === 1 ? "" : "s"}`,
      noDraft: "Aucune présentation générée",
      meetingOverdue: "Date de réunion dépassée — cycle encore ouvert",
      stale: (n: number) => `Aucune activité courriel depuis ${n} jours`,
    },
    milestones: {
      postMeeting: "Après la réunion",
      finalReview: "Fenêtre de révision finale",
      draftDue: "Zone d'échéance de l'ébauche",
      vpPrep: "Fenêtre de préparation VP",
      metricsCollection: "Collecte des indicateurs",
      directorCheckin: "Point avec le directeur",
      earlyCycle: "Début de cycle",
    },
  },
  nav: {
    dashboard: "Tableau de bord",
    settings: "Paramètres",
    accounts: "Comptes",
    users: "Utilisateurs",
    emailSim: "Simulateur courriel",
    jobs: "Tâches",
    newQbr: "Nouvelle BR",
    editor: "Éditeur",
    language: "Langue",
  },
  metricGroups: {
    healthAndSafety: "Santé et sécurité",
    operational: "Opérationnel",
    financial: "Financier",
  },
  missingInfo: {
    followUpStatuses: "Statuts des engagements précédents",
    priorityItems: "2 à 3 éléments prioritaires",
    dashboardMetrics: "Indicateurs du tableau de bord",
    upcomingItems: "Prochaines étapes",
    nextQbrDate: "Date proposée de la prochaine BR",
  },
} as const;

export type FrStrings = typeof fr;
