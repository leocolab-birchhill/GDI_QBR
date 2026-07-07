import { prisma } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { getEmailProvider, sendQbrEmail } from "../email";
import { InboundEmail, OutboundAttachment } from "../email/providers/EmailProvider";
import {
  buildEmailResponse,
  EmailMode,
  QbrContextHeaderInput,
} from "../email/responseBuilder";
import { EmailContent } from "../email/templates";
import { classifyEmailIntent, detectEmailLanguageAI, extractQbrDataFromEmail, runQbrAgent } from "../ai";
import { detectEmailLocale, type Locale } from "../i18n";
import { extractClientNameHint } from "../ai/fallbacks";
import { getEmailStrings } from "../email/emailStrings";
import { stripQuotedReply } from "../email/quoted";
import { QbrAction } from "./action";
import { buildAnswerContext } from "./answerContext";
import {
  applyExtraction,
  deckAttachment,
  ensureDeckForAttachment,
  finalize,
  FinalizationBlockedError,
  findOrCreateAccount,
  findOrCreateCycle,
  generateDraft,
  getLatestDeck,
  getQbrFull,
  listUnconfirmed,
  recordApproval,
  setStatus,
} from "./service";
import { getSettings } from "./settings";

export interface ProcessResult {
  intent: string;
  /** "workflow" when data was captured or a hard action ran; else "agent". */
  mode: "workflow" | "agent";
  /** The hard action the agent decided to perform (or "none"). */
  action: QbrAction;
  qbrCycleId: string | null;
  reply?: { subject: string; text: string };
  /** Set when a deck was generated, so callers/UIs can offer a direct download. */
  deck?: { fileName: string; downloadUrl: string };
  notes: string[];
}

/**
 * Reply context derived from the inbound email. Carried into every outbound
 * send so the response goes back in-thread (Graph reply/createReply) and keeps
 * RFC 5322 In-Reply-To/References when the provider reply API is unavailable.
 */
interface ReplyContext {
  to: string;
  subject: string;
  threadDbId: string;
  replyToProviderMessageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  conversationId: string | null;
}

type Cycle = { id: string; accountId: string };
type FullQbr = NonNullable<Awaited<ReturnType<typeof getQbrFull>>>;

/**
 * Central inbound-email handler — an agentic, conversational pipeline:
 *
 *   1. Classify + extract, and ALWAYS capture any provided data (dedup-safe).
 *   2. Load the full QBR context from the DB.
 *   3. Ask the LLM agent to answer conversationally AND flag any hard action
 *      (generate deck, approve, revise, finalize, send survey).
 *   4. Execute the flagged action (e.g. actually build + attach the .pptx).
 *   5. Reply IN-THREAD with a context-headed email: the agent's answer, what
 *      was captured (only what changed), the deck (when generated), and clear
 *      next actions.
 *
 * This means the bot behaves like a chatbot that knows the whole deal AND can
 * perform the real actions on request.
 */
export async function processInboundEmail(inbound: InboundEmail): Promise<ProcessResult> {
  const provider = getEmailProvider();
  const providerThreadId =
    inbound.conversationId ??
    provider.getThreadId({
      subject: inbound.subject,
      providerThreadId: inbound.providerThreadId,
    });

  const notes: string[] = [];

  // ── Language identification ─────────────────────────────────────────────────
  // Decide whether THIS email is French or English up front, then produce the
  // entire reply (agent answer + all static scaffolding) in that language.
  //
  // Detect on the sender's LATEST message only — quoted reply history is
  // stripped so an English reply inside a French thread isn't misread. A fast
  // OpenAI call does the identification; if no key is configured (or it fails)
  // we fall back to the deterministic word-based detector.
  const latestMessage = stripQuotedReply(inbound.bodyText);
  const locale =
    (await detectEmailLanguageAI({ subject: inbound.subject, body: latestMessage })) ??
    detectEmailLocale(inbound.subject, latestMessage);
  notes.push(`Detected language: ${locale}`);

  // ── Idempotency guard ───────────────────────────────────────────────────────
  // The same inbound message can be delivered to us more than once (overlapping
  // poll cycles, a failed markRead, a webhook racing the poller, a retried POST).
  // If we have ALREADY stored this provider/internet message id as inbound, this
  // is a duplicate: skip all processing so we never send a second reply.
  const dupOr = [
    inbound.providerMessageId ? { providerMessageId: inbound.providerMessageId } : null,
    inbound.internetMessageId ? { internetMessageId: inbound.internetMessageId } : null,
  ].filter(Boolean) as { providerMessageId?: string; internetMessageId?: string }[];
  if (dupOr.length) {
    const already = await prisma.emailMessage.findFirst({
      where: { direction: "inbound", OR: dupOr },
      include: { thread: true },
    });
    if (already) {
      notes.push("Duplicate inbound email ignored (already processed)");
      return {
        intent: "DUPLICATE",
        mode: "agent",
        action: "none",
        qbrCycleId: already.thread?.qbrCycleId ?? null,
        notes,
      };
    }
  }

  let cycle = await findCycleForInbound(inbound, providerThreadId);

  const classification = await classifyEmailIntent({ subject: inbound.subject, body: inbound.bodyText });
  const extraction = await extractQbrDataFromEmail({
    subject: inbound.subject,
    body: inbound.bodyText,
    knownClient: cycle ? await accountName(cycle.accountId) : undefined,
  });
  const intent = classification.intent;
  notes.push(`Classified intent: ${intent} (confidence ${classification.confidence})`);

  await audit({
    entityType: "EmailMessage",
    action: "ai.classify",
    actorEmail: inbound.fromEmail,
    metadata: { intent, confidence: classification.confidence },
  });

  // Persist the inbound message + thread, capturing all provider threading/reply
  // metadata so the response can be a real in-thread reply.
  const thread = await upsertThread(providerThreadId, inbound.subject, cycle?.id ?? null, inbound.conversationId ?? null);
  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      fromEmail: inbound.fromEmail,
      toEmail: inbound.toEmail,
      subject: inbound.subject,
      bodyText: inbound.bodyText,
      direction: "inbound",
      providerMessageId: inbound.providerMessageId ?? null,
      internetMessageId: inbound.internetMessageId ?? null,
      conversationId: inbound.conversationId ?? providerThreadId,
      inReplyTo: inbound.inReplyTo ?? null,
      references: inbound.references ?? null,
    },
  });
  for (const att of inbound.attachments ?? []) {
    await prisma.attachment.create({
      data: {
        emailMessageId: message.id,
        qbrCycleId: cycle?.id ?? null,
        filename: att.filename,
        mimeType: att.mimeType,
        extractedText: att.extractedText,
      },
    });
  }

  const reply: ReplyContext = {
    to: inbound.fromEmail,
    subject: inbound.subject,
    threadDbId: thread.id,
    // Reply to THIS inbound message so it lands in the same Outlook conversation.
    replyToProviderMessageId: inbound.providerMessageId ?? null,
    inReplyTo: inbound.internetMessageId ?? null,
    references: [inbound.references, inbound.internetMessageId].filter(Boolean).join(" ") || null,
    conversationId: inbound.conversationId ?? providerThreadId,
  };

  // ── Bootstrap a new QBR when asked ──────────────────────────────────────────
  let createdNew = false;
  if (!cycle && intent === "CREATE_QBR") {
    cycle = await createCycleFromEmail(inbound, extraction, thread.id, locale);
    createdNew = true;
    notes.push(`Created QBR cycle ${cycle.id}`);
  }

  // No cycle and not creating one → conversational "I need the client/quarter".
  if (!cycle) {
    return noCycle(intent, reply, notes, locale);
  }

  // ── 1. Always capture provided data (dedup-safe; returns only what changed) ──
  let capturedChanges: string[] = [];
  if (hasExtractedData(extraction) || createdNew) {
    const applied = await applyExtraction(cycle.id, extraction, inbound.fromEmail);
    capturedChanges = applied.changed;
    const cur = await prisma.qbrCycle.findUnique({ where: { id: cycle.id } });
    if (cur && cur.status === "DRAFT_CREATED") await setStatus(cycle.id, "COLLECTING_INPUTS");
    if (capturedChanges.length) notes.push(`Captured ${capturedChanges.length} change(s)`);
  }

  // ── 2. Load full context ────────────────────────────────────────────────────
  let full = await getQbrFull(cycle.id);
  if (!full) return noCycle(intent, reply, notes, locale);

  // ── 3. Conversational agent answer + flagged action ─────────────────────────
  const agent = await runQbrAgent({
    message: `${inbound.subject}\n\n${inbound.bodyText}`.trim(),
    context: buildAnswerContext(full),
    capturedChanges,
    locale,
  });
  notes.push(`Agent action: ${agent.action}`);

  // ── 4. Execute the hard action (if any) ─────────────────────────────────────
  const outcome = await executeAction(cycle.id, agent.action, agent.revisionNote ?? null, inbound.fromEmail, notes, locale);

  // Reload after side effects (status / deck versions may have changed).
  full = (await getQbrFull(cycle.id)) ?? full;

  // ── 5. Compose + send the in-thread reply ───────────────────────────────────
  const isWorkflowTurn = agent.action !== "none" || capturedChanges.length > 0 || createdNew;
  const openMissing = full.missingInfoRequests.filter((m) => m.status === "Open").map((m) => m.question);

  const modeLabel: EmailMode =
    outcome.modeHint ?? (capturedChanges.length || createdNew ? "Captured update" : "Answer");

  // Only surface the structured "Still needed" list on workflow turns — never
  // hard-append it to a plain conversational answer.
  const missingInfo = outcome.extraMissing ?? (isWorkflowTurn ? openMissing : []);

  const intro = createdNew
    ? `${getEmailStrings(locale).startedQbr(full.account.clientName, full.quarter, full.year)}${
        outcome.intro ? `\n${outcome.intro}` : ""
      }`
    : outcome.intro;

  const nextActions = [...(outcome.extraNext ?? []), ...agent.nextActions];

  // Requirement: the .pptx must be attached to EVERY reply. If a hard action
  // already produced a deck this turn, attach that; otherwise attach the latest
  // existing deck (rendering one once if none exists). Never block the reply on a
  // deck failure — fall back to sending without the attachment.
  let attachmentDeck = outcome.deck
    ? { fileName: outcome.deck.fileName, downloadUrl: outcome.deck.downloadUrl, buffer: outcome.deck.buffer }
    : null;
  if (!attachmentDeck) {
    try {
      attachmentDeck = await ensureDeckForAttachment(cycle.id);
      notes.push(`Attached deck ${attachmentDeck.fileName}`);
    } catch (err) {
      notes.push(`Could not attach deck: ${(err as Error).message}`);
    }
  }

  const content = await sendResponse({
    reply,
    locale,
    qbrCycleId: cycle.id,
    qbrContext: headerFromFull(full),
    mode: modeLabel,
    intro,
    answerText: agent.reply,
    capturedItems: isWorkflowTurn ? capturedChanges : [],
    missingInfo,
    nextActions,
    approvalRequest: outcome.approvalRequest,
    attachments: attachmentDeck
      ? [deckAttachment(attachmentDeck.fileName, attachmentDeck.buffer)]
      : undefined,
  });

  return {
    intent,
    mode: isWorkflowTurn ? "workflow" : "agent",
    action: agent.action,
    qbrCycleId: cycle.id,
    reply: content,
    deck: attachmentDeck
      ? { fileName: attachmentDeck.fileName, downloadUrl: attachmentDeck.downloadUrl }
      : undefined,
    notes,
  };
}

// ── Action execution ──────────────────────────────────────────────────────────

interface ActionOutcome {
  modeHint: EmailMode | null;
  deck?: { fileName: string; downloadUrl: string; buffer: Buffer };
  approvalRequest?: boolean;
  intro?: string;
  extraMissing?: string[];
  extraNext?: string[];
}

async function executeAction(
  qbrCycleId: string,
  action: QbrAction,
  revisionNote: string | null,
  fromEmail: string,
  notes: string[],
  locale: Locale,
): Promise<ActionOutcome> {
  const t = getEmailStrings(locale);
  switch (action) {
    case "generate_draft": {
      const { fileName, downloadUrl, buffer, unconfirmed } = await generateDraft(qbrCycleId);
      await setStatus(qbrCycleId, "VP_REVIEW");
      notes.push(`Generated draft ${fileName}`);
      return {
        modeHint: "Approval",
        deck: { fileName, downloadUrl, buffer },
        approvalRequest: true,
        intro: t.draftAttached(fileName),
        extraMissing: unconfirmed,
        extraNext: [t.draftReplyActions],
      };
    }
    case "send_deck": {
      const existing = await getLatestDeck(qbrCycleId);
      if (existing) {
        notes.push(`Attached current deck ${existing.fileName} (v${existing.versionNumber})`);
        return {
          modeHint: "Approval",
          deck: { fileName: existing.fileName, downloadUrl: existing.downloadUrl, buffer: existing.buffer },
          intro: t.currentDeckAttached(existing.fileName),
          extraNext: t.rebuildDeckActions,
        };
      }
      const { fileName, downloadUrl, buffer, unconfirmed } = await generateDraft(qbrCycleId);
      await setStatus(qbrCycleId, "VP_REVIEW");
      notes.push(`No existing deck; generated ${fileName}`);
      return {
        modeHint: "Approval",
        deck: { fileName, downloadUrl, buffer },
        approvalRequest: true,
        intro: t.noDeckGenerated(fileName),
        extraMissing: unconfirmed,
        extraNext: [t.draftReplyActions],
      };
    }
    case "approve": {
      await recordApproval({ qbrCycleId, approverEmail: fromEmail, status: "approved" });
      notes.push("Approval recorded");
      return {
        modeHint: "Approval",
        intro: t.approvalRecorded,
        extraNext: [t.approvalNext],
      };
    }
    case "revise": {
      await recordApproval({
        qbrCycleId,
        approverEmail: fromEmail,
        status: "revision_requested",
        comments: revisionNote ?? undefined,
      });
      const { fileName, downloadUrl, buffer, unconfirmed } = await generateDraft(qbrCycleId);
      notes.push("Revision recorded and deck regenerated");
      return {
        modeHint: "Approval",
        deck: { fileName, downloadUrl, buffer },
        approvalRequest: true,
        intro: t.revisedDraftAttached(fileName),
        extraMissing: unconfirmed,
        extraNext: [t.draftReplyActions],
      };
    }
    case "finalize": {
      const settings = await getSettings();
      try {
        const { fileName, downloadUrl, buffer } = await finalize(qbrCycleId, {
          allowOverride: settings.allowFinalizeOverride,
        });
        notes.push(`Finalized: ${fileName}`);
        return {
          modeHint: "Captured update",
          deck: { fileName, downloadUrl, buffer },
          intro: t.finalDeckAttached(fileName),
          extraNext: t.finalizeNext,
        };
      } catch (err) {
        if (err instanceof FinalizationBlockedError) {
          const full = await getQbrFull(qbrCycleId);
          notes.push(`Finalization blocked: ${err.reason}`);
          return {
            modeHint: "Missing info",
            intro: t.finalizationBlocked(err.reason),
            extraMissing: full ? listUnconfirmed(full) : [],
            extraNext: [t.finalizationBlockedNext],
          };
        }
        throw err;
      }
    }
    case "send_survey":
      notes.push("Survey requested");
      return {
        modeHint: "Captured update",
        intro: t.surveyQueued,
        extraNext: [t.surveyNext],
      };
    case "none":
    default:
      return { modeHint: null };
  }
}

// ── Outbound helper ───────────────────────────────────────────────────────────

/** Build a context-headed email via buildEmailResponse() and send it in-thread. */
async function sendResponse(opts: {
  reply: ReplyContext;
  locale?: Locale;
  qbrCycleId: string | null;
  qbrContext: QbrContextHeaderInput | null;
  mode: EmailMode;
  intro?: string;
  capturedItems?: string[];
  answerText?: string;
  missingInfo?: string[];
  nextActions?: string[];
  approvalRequest?: boolean;
  attachments?: OutboundAttachment[];
}): Promise<EmailContent> {
  const content = buildEmailResponse({
    qbrContext: opts.qbrContext,
    locale: opts.locale,
    mode: opts.mode,
    replySubject: opts.reply.subject,
    intro: opts.intro,
    capturedItems: opts.capturedItems,
    answerText: opts.answerText,
    missingInfo: opts.missingInfo,
    nextActions: opts.nextActions,
    approvalRequest: opts.approvalRequest,
  });

  await sendQbrEmail({
    to: opts.reply.to,
    qbrCycleId: opts.qbrCycleId,
    threadId: opts.reply.threadDbId,
    subject: content.subject,
    text: content.text,
    html: content.html,
    attachments: opts.attachments,
    replyToProviderMessageId: opts.reply.replyToProviderMessageId,
    inReplyTo: opts.reply.inReplyTo,
    references: opts.reply.references,
    conversationId: opts.reply.conversationId,
  });

  return content;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hasExtractedData(ex: Awaited<ReturnType<typeof extractQbrDataFromEmail>>): boolean {
  return (
    ex.commitments.length > 0 ||
    ex.priorityItems.length > 0 ||
    ex.metrics.length > 0 ||
    ex.upcomingItems.length > 0 ||
    ex.missingInfoAnswers.length > 0 ||
    // Single-field updates (e.g. an email that ONLY supplies the next meeting
    // date or the meeting date) must still be captured and persisted, otherwise
    // a later "when is the next meeting?" can't be answered.
    Boolean(ex.meetingDate) ||
    Boolean(ex.nextMeetingDate)
  );
}

function headerFromFull(full: FullQbr): QbrContextHeaderInput {
  return {
    clientName: full.account.clientName,
    quarter: full.quarter,
    year: full.year,
    status: full.status,
  };
}

async function createCycleFromEmail(
  inbound: InboundEmail,
  ex: Awaited<ReturnType<typeof extractQbrDataFromEmail>>,
  threadId: string,
  detectedLocale: Locale,
): Promise<Cycle> {
  // Prefer the AI-extracted client name; fall back to a deterministic scan for
  // "create an account called/named …" phrasing so a clearly-named client is
  // never lost to "Unknown Client".
  const clientName =
    ex.clientName || extractClientNameHint(inbound.subject, inbound.bodyText) || "Unknown Client";
  const quarter = ex.quarter || "Q1";
  const year = ex.year || new Date().getFullYear();

  const account = await findOrCreateAccount(clientName);
  const creator = await prisma.user.findUnique({ where: { email: inbound.fromEmail } });
  const cycle = await findOrCreateCycle({
    accountId: account.id,
    quarter,
    year,
    meetingDate: parseDate(ex.meetingDate),
    createdById: creator?.id ?? null,
    previousQbrNotes: inbound.attachments?.find((a) => a.extractedText)?.extractedText ?? null,
  });

  const { createMissingInfoChecklistLocalized } = await import("./createWorkflow");
  // Use the language detected from the email so a brand-new client/account is
  // created in the language the requester actually wrote in.
  const locale: Locale = detectedLocale;
  // Persist the detected language on the account so future cycles default to it.
  if (account.language !== locale) {
    await prisma.account.update({ where: { id: account.id }, data: { language: locale } }).catch(() => undefined);
  }
  await prisma.qbrCycle.update({
    where: { id: cycle.id },
    data: {
      language: locale,
      editorProgressJson: JSON.stringify({
        currentSection: "title",
        confirmedSections: [],
        guidedMode: true,
      }),
      agendaSectionsJson: JSON.stringify(
        (await import("../i18n")).defaultAgenda(locale),
      ),
    },
  });

  await prisma.emailThread.update({ where: { id: threadId }, data: { qbrCycleId: cycle.id } });
  await createMissingInfoChecklistLocalized(cycle.id, locale);

  // Auto-generate blank structured deck on creation.
  try {
    await generateDraft(cycle.id, { skipAi: true, keepStatus: true });
  } catch {
    /* deck generation is best-effort at bootstrap */
  }

  return cycle;
}

async function findCycleForInbound(inbound: InboundEmail, providerThreadId: string): Promise<Cycle | null> {
  const thread = await prisma.emailThread.findFirst({
    where: { providerThreadId, qbrCycleId: { not: null } },
  });
  if (thread?.qbrCycleId) {
    const c = await prisma.qbrCycle.findUnique({ where: { id: thread.qbrCycleId } });
    if (c) return c;
  }
  const ex = await extractQbrDataFromEmail({ subject: inbound.subject, body: inbound.bodyText });
  const haystack = `${inbound.subject}\n${inbound.bodyText}`.toLowerCase();
  const accounts = await prisma.account.findMany();

  const account = matchAccount(accounts, haystack, ex.clientName ?? null);

  if (account) {
    const c = await prisma.qbrCycle.findFirst({
      where: {
        accountId: account.id,
        ...(ex.quarter ? { quarter: ex.quarter } : {}),
        ...(ex.year ? { year: ex.year } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (c) return c;
    const latest = await prisma.qbrCycle.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
    });
    if (latest) return latest;
  }
  return null;
}

/** Generic words that don't help identify a specific client. */
const NAME_STOPWORDS = new Set([
  "the", "and", "of", "for", "inc", "inc.", "corp", "corp.", "co", "co.", "ltd", "ltd.",
  "llc", "llp", "company", "group", "holdings", "partners", "university", "college",
  "school", "services", "service", "solutions", "systems", "international", "global",
  "national", "canada", "qbr", "deck", "update", "quarter",
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

function matchAccount<T extends { clientName: string }>(
  accounts: T[],
  haystack: string,
  exClientName: string | null,
): T | undefined {
  const exLower = exClientName?.toLowerCase().trim() ?? "";
  const exTokens = exClientName ? nameTokens(exClientName) : [];

  let best: { account: T; score: number } | null = null;

  for (const a of accounts) {
    const nameLower = a.clientName.toLowerCase().trim();
    const tokens = nameTokens(a.clientName);
    let score = 0;

    if (exLower && (exLower === nameLower || nameLower.includes(exLower) || exLower.includes(nameLower))) {
      score += 100;
    }
    if (haystack.includes(nameLower)) score += 50;

    for (const t of tokens) {
      if (haystack.includes(t)) score += 10;
      if (exTokens.includes(t)) score += 10;
    }

    if (score > 0 && (!best || score > best.score)) best = { account: a, score };
  }

  return best?.account;
}

async function upsertThread(
  providerThreadId: string,
  subject: string,
  qbrCycleId: string | null,
  conversationId: string | null,
) {
  const existing = await prisma.emailThread.findFirst({ where: { providerThreadId } });
  if (existing) {
    const data: Record<string, unknown> = {};
    if (qbrCycleId && !existing.qbrCycleId) data.qbrCycleId = qbrCycleId;
    if (conversationId && !existing.conversationId) data.conversationId = conversationId;
    if (Object.keys(data).length) {
      return prisma.emailThread.update({ where: { id: existing.id }, data });
    }
    return existing;
  }
  return prisma.emailThread.create({
    data: {
      providerThreadId,
      subject,
      qbrCycleId: qbrCycleId ?? undefined,
      conversationId: conversationId ?? undefined,
    },
  });
}

async function accountName(accountId: string): Promise<string | undefined> {
  const a = await prisma.account.findUnique({ where: { id: accountId } });
  return a?.clientName;
}

async function noCycle(
  intent: string,
  reply: ReplyContext,
  notes: string[],
  locale: Locale,
): Promise<ProcessResult> {
  const t = getEmailStrings(locale);
  const content = await sendResponse({
    reply,
    locale,
    qbrCycleId: null,
    qbrContext: null,
    mode: "Answer",
    answerText: t.noCycleAnswer,
    nextActions: [t.noCycleNext],
  });
  notes.push("No matching cycle");
  return { intent, mode: "agent", action: "none", qbrCycleId: null, reply: content, notes };
}

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
