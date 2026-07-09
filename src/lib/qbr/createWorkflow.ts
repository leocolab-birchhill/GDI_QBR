import { prisma } from "../db";
import { audit } from "../audit";
import {
  DEFAULT_LOCALE,
  type Locale,
  type GuidedSection,
  parseLocale,
  defaultAgenda,
  getStrings,
  readEditorProgress,
} from "../i18n";
import {
  findOrCreateCycle,
  createMissingInfoChecklist,
  generateDraft,
  readDeckOptions,
} from "./service";

export interface CreateClientInput {
  clientName: string;
  quarter?: string;
  year?: number;
  meetingDate?: Date | null;
  language?: Locale;
  logoUrl?: string | null;
  region?: string | null;
  vpOwnerId?: string | null;
  directorId?: string | null;
  accountManagerId?: string | null;
  stakeholderEmails?: string[];
  metadata?: Record<string, unknown>;
  createdById?: string | null;
}

export interface CreateBlankQbrInput {
  accountId: string;
  quarter?: string;
  year?: number;
  meetingDate?: Date | null;
  language?: Locale | null;
  createdById?: string | null;
}

function currentQuarter(): string {
  const m = new Date().getMonth();
  if (m < 3) return "Q1";
  if (m < 6) return "Q2";
  if (m < 9) return "Q3";
  return "Q4";
}

function parseStakeholderEmails(emails?: string[]): { name: string; email: string }[] {
  if (!emails?.length) return [];
  return emails
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => {
      const local = email.split("@")[0] ?? email;
      const name = local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return { name, email };
    });
}

/** Create a new client account with optional stakeholders and metadata. */
export async function createClientAccount(input: CreateClientInput) {
  const language = parseLocale(input.language ?? DEFAULT_LOCALE);
  const account = await prisma.account.create({
    data: {
      clientName: input.clientName.trim(),
      region: input.region ?? null,
      logoUrl: input.logoUrl ?? null,
      language,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      vpOwnerId: input.vpOwnerId ?? null,
      directorId: input.directorId ?? null,
      accountManagerId: input.accountManagerId ?? null,
    },
  });

  const stakeholders = parseStakeholderEmails(input.stakeholderEmails);
  for (const s of stakeholders) {
    await prisma.clientContact.create({
      data: { accountId: account.id, name: s.name, email: s.email, isDecisionMaker: false },
    });
  }

  await audit({
    entityType: "Account",
    entityId: account.id,
    action: "account.created",
    metadata: { clientName: account.clientName, language },
  });

  return account;
}

/**
 * Create a blank QBR cycle: structure-only deck with no follow-ups, metrics,
 * priorities, or next-step content. Reuses account metadata (logo, language,
 * stakeholders) but starts with empty content rows.
 */
export async function createBlankQbr(input: CreateBlankQbrInput) {
  const account = await prisma.account.findUnique({
    where: { id: input.accountId },
    include: { contacts: true },
  });
  if (!account) throw new Error("Account not found");

  const quarter = input.quarter ?? currentQuarter();
  const year = input.year ?? new Date().getFullYear();
  const language = input.language ? parseLocale(input.language) : parseLocale(account.language);

  const existing = await prisma.qbrCycle.findFirst({
    where: { accountId: account.id, quarter, year },
  });
  if (existing) {
    throw new Error(`A QBR already exists for ${account.clientName} ${quarter} ${year}`);
  }

  const agenda = defaultAgenda(language);
  const cycle = await findOrCreateCycle({
    accountId: account.id,
    quarter,
    year,
    meetingDate: input.meetingDate ?? null,
    createdById: input.createdById ?? null,
  });

  await prisma.qbrCycle.update({
    where: { id: cycle.id },
    data: {
      language,
      agendaSectionsJson: JSON.stringify(agenda),
      editorProgressJson: JSON.stringify({
        currentSection: "title",
        confirmedSections: [],
        guidedMode: true,
      }),
      deckOptionsJson: JSON.stringify({
        ...readDeckOptions(cycle.deckOptionsJson),
        clientLogoUrl: account.logoUrl ?? undefined,
      }),
    },
  });

  await createMissingInfoChecklistLocalized(cycle.id, language);
  const draft = await generateDraft(cycle.id, { skipAi: true, keepStatus: true });

  await audit({
    entityType: "QbrCycle",
    entityId: cycle.id,
    action: "qbr.blank_created",
    metadata: { accountId: account.id, quarter, year, language },
  });

  return { cycle, account, draft };
}

/** Create a new client AND a blank QBR in one step. */
export async function createClientWithBlankQbr(input: CreateClientInput) {
  const account = await createClientAccount(input);
  const { cycle, draft } = await createBlankQbr({
    accountId: account.id,
    quarter: input.quarter,
    year: input.year,
    meetingDate: input.meetingDate,
    language: parseLocale(input.language ?? account.language),
    createdById: input.createdById,
  });
  return { account, cycle, draft };
}

/** Localized missing-info checklist. */
export async function createMissingInfoChecklistLocalized(qbrCycleId: string, locale?: string | null) {
  const s = getStrings(locale);
  const items = [
    { field: "followUpStatuses", question: s.missingInfo.followUpStatuses },
    { field: "priorityItems", question: s.missingInfo.priorityItems },
    { field: "dashboardMetrics", question: s.missingInfo.dashboardMetrics },
    { field: "upcomingItems", question: s.missingInfo.upcomingItems },
    { field: "nextQbrDate", question: s.missingInfo.nextQbrDate },
  ];
  for (const it of items) {
    const exists = await prisma.missingInfoRequest.findFirst({
      where: { qbrCycleId, field: it.field },
    });
    if (!exists) {
      await prisma.missingInfoRequest.create({
        data: { qbrCycleId, field: it.field, question: it.question, status: "Open" },
      });
    }
  }
}

/** Update deck render language and regenerate .pptx with localized structure. */
export async function setDeckLanguage(qbrCycleId: string, language: Locale) {
  const locale = parseLocale(language);
  await prisma.qbrCycle.update({
    where: { id: qbrCycleId },
    data: {
      language: locale,
      agendaSectionsJson: JSON.stringify(defaultAgenda(locale)),
    },
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "deck.language_changed",
    metadata: { language: locale },
  });
  return generateDraft(qbrCycleId, { skipAi: true, keepStatus: true, forceTranslate: true });
}

/** @deprecated Use setDeckLanguage — kept for API compatibility. */
export const setQbrLanguage = setDeckLanguage;

/** Persist editor/site UI language (independent of deck language). */
export async function setUiLocale(qbrCycleId: string, uiLocale: Locale) {
  const locale = parseLocale(uiLocale);
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  const current = readDeckOptions(cycle?.deckOptionsJson);
  await prisma.qbrCycle.update({
    where: { id: qbrCycleId },
    data: { deckOptionsJson: JSON.stringify({ ...current, uiLocale: locale }) },
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "ui.language_changed",
    metadata: { uiLocale: locale },
  });
  return locale;
}

/** Advance guided editor to the next section. */
export async function confirmGuidedSection(
  qbrCycleId: string,
  section: string,
  actorEmail?: string,
) {
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  if (!cycle) throw new Error("QBR not found");

  let progress: { currentSection: string; confirmedSections: string[]; guidedMode: boolean };
  try {
    progress = JSON.parse(cycle.editorProgressJson || "{}");
  } catch {
    progress = { currentSection: "title", confirmedSections: [], guidedMode: true };
  }

  const confirmed = new Set(progress.confirmedSections ?? []);
  confirmed.add(section);

  const order = ["title", "agenda", "followUps", "priorities", "dashboard", "whatsNext", "questions"];
  const idx = order.indexOf(section);
  const nextSection = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : section;

  const updated = {
    ...progress,
    confirmedSections: [...confirmed],
    currentSection: nextSection,
    guidedMode: true,
  };

  await prisma.qbrCycle.update({
    where: { id: qbrCycleId },
    data: { editorProgressJson: JSON.stringify(updated) },
  });

  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "editor.section_confirmed",
    actorEmail,
    metadata: { section, nextSection },
  });

  return updated;
}

/**
 * Jump the guided editor to a specific section WITHOUT confirming it — used when
 * the user clicks the timeline above the chat to go back and revise an earlier
 * slide. Keeps confirmedSections intact so prior progress isn't lost.
 */
export async function setGuidedSection(
  qbrCycleId: string,
  section: GuidedSection,
  completed?: boolean,
) {
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  if (!cycle) throw new Error("QBR not found");
  const progress = readEditorProgress(cycle.editorProgressJson);
  const confirmed = new Set(progress.confirmedSections);
  if (completed === true) confirmed.add(section);
  if (completed === false) confirmed.delete(section);
  const updated = {
    ...progress,
    confirmedSections: [...confirmed],
    currentSection: section,
    guidedMode: true,
  };
  await prisma.qbrCycle.update({
    where: { id: qbrCycleId },
    data: { editorProgressJson: JSON.stringify(updated) },
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: completed == null ? "editor.section_selected" : "editor.section_completion_set",
    metadata: { section, completed },
  });
  return updated;
}

/** Rename the client/account tied to a QBR cycle. Returns the new name. */
export async function renameQbrAccount(qbrCycleId: string, clientName: string) {
  const name = clientName.trim();
  if (!name) throw new Error("Client name cannot be empty");
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  if (!cycle) throw new Error("QBR not found");
  await prisma.account.update({ where: { id: cycle.accountId }, data: { clientName: name } });
  await audit({
    entityType: "Account",
    entityId: cycle.accountId,
    action: "account.renamed",
    metadata: { clientName: name, qbrCycleId },
  });
  return name;
}

/** Persist an editor chat message for collaborative access. */
export async function saveEditorMessage(args: {
  qbrCycleId: string;
  role: "user" | "assistant" | "system";
  text: string;
  actorEmail?: string;
  actorName?: string;
  section?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return prisma.editorMessage.create({
    data: {
      qbrCycleId: args.qbrCycleId,
      role: args.role,
      text: args.text,
      actorEmail: args.actorEmail ?? null,
      actorName: args.actorName ?? null,
      section: args.section ?? null,
      metadataJson: args.metadata ? JSON.stringify(args.metadata) : null,
    },
  });
}

/** Load editor messages for collaborative session (newest last). */
export async function loadEditorMessages(qbrCycleId: string, since?: Date, section?: string | null) {
  return prisma.editorMessage.findMany({
    where: {
      qbrCycleId,
      ...(since ? { createdAt: { gt: since } } : {}),
      ...(section ? { section } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
}
