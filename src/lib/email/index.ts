import { prisma } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { enrichWithEditorLink } from "./outboundEnrichment";
import { EmailProvider, OutboundAttachment } from "./providers/EmailProvider";
import { MockEmailProvider } from "./providers/MockEmailProvider";
import { MicrosoftGraphEmailProvider } from "./providers/MicrosoftGraphEmailProvider";

let cached: EmailProvider | null = null;

/** Resolve the configured provider, falling back to Mock when unavailable. */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  switch (env.EMAIL_PROVIDER) {
    case "graph":
      cached = new MicrosoftGraphEmailProvider();
      break;
    // TODO: case "sendgrid" / "mailgun" / "postmark"
    case "mock":
    default:
      cached = new MockEmailProvider();
  }
  return cached;
}

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
  qbrCycleId?: string | null;
  threadId?: string | null; // EmailThread.id (our DB id)
  attachments?: OutboundAttachment[];
  /** Original provider message id to reply to (keeps the response in-thread). */
  replyToProviderMessageId?: string | null;
  /** RFC 5322 In-Reply-To / References to carry forward. */
  inReplyTo?: string | null;
  references?: string | null;
  /** Provider conversation id of the thread (Graph conversationId). */
  conversationId?: string | null;
}

/**
 * Send an email through the active provider AND persist it as an outbound
 * EmailMessage so the workspace "Emails" tab shows a full transcript.
 */
export async function sendQbrEmail(args: SendArgs) {
  const provider = getEmailProvider();
  const from = `${env.EMAIL_SENDER_NAME} <${env.QBR_MAILBOX}>`;

  let text = args.text;
  let html = args.html;
  let attachments = args.attachments;

  if (args.qbrCycleId) {
    const enriched = await enrichWithEditorLink({
      qbrCycleId: args.qbrCycleId,
      text,
      html,
      attachments,
    });
    text = enriched.text;
    html = enriched.html;
    attachments = enriched.attachments;
  }

  // Ensure a DB thread exists (group by subject/conversation when no thread provided).
  const dbThread = await resolveThread(
    args.qbrCycleId ?? null,
    args.threadId ?? null,
    args.subject,
    args.conversationId ?? null,
  );

  // Build a References chain so even providers without a reply API thread well.
  const references = [args.references, args.inReplyTo].filter(Boolean).join(" ") || null;

  const outbound = {
    to: args.to,
    from,
    subject: args.subject,
    text,
    html,
    threadId: dbThread?.providerThreadId ?? args.conversationId ?? null,
    replyToProviderMessageId: args.replyToProviderMessageId ?? null,
    inReplyTo: args.inReplyTo ?? null,
    references,
  };

  const result =
    attachments && attachments.length > 0
      ? await provider.sendEmailWithAttachment(outbound, attachments)
      : await provider.sendEmail(outbound);

  if (dbThread) {
    await prisma.emailMessage.create({
      data: {
        threadId: dbThread.id,
        fromEmail: env.QBR_MAILBOX,
        toEmail: args.to,
        subject: args.subject,
        bodyText: text,
        direction: "outbound",
        providerMessageId: result.id,
        conversationId: dbThread.conversationId ?? result.threadId ?? args.conversationId ?? null,
        inReplyTo: args.inReplyTo ?? null,
        references,
      },
    });
  }

  await audit({
    entityType: "EmailMessage",
    entityId: result.id,
    action: "email.sent",
    metadata: { to: args.to, subject: args.subject, provider: result.provider },
  });

  return result;
}

async function resolveThread(
  qbrCycleId: string | null,
  threadId: string | null,
  subject: string,
  conversationId: string | null,
) {
  if (threadId) {
    const t = await prisma.emailThread.findUnique({ where: { id: threadId } });
    if (t) return t;
  }
  // Prefer the provider conversation id when we have it (maps all related
  // emails to the same thread → same QBR cycle).
  const providerThreadId = conversationId ?? getEmailProvider().getThreadId({ subject });
  const existing = await prisma.emailThread.findFirst({
    where: { providerThreadId },
  });
  if (existing) {
    if (qbrCycleId && !existing.qbrCycleId) {
      return prisma.emailThread.update({ where: { id: existing.id }, data: { qbrCycleId } });
    }
    return existing;
  }
  return prisma.emailThread.create({
    data: {
      qbrCycleId: qbrCycleId ?? undefined,
      providerThreadId,
      conversationId: conversationId ?? undefined,
      subject,
    },
  });
}
