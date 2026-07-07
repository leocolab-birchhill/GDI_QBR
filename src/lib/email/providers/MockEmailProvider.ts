import {
  EmailProvider,
  InboundEmail,
  OutboundAttachment,
  OutboundEmail,
  SendResult,
} from "./EmailProvider";

/**
 * Fully offline provider used for local development and tests.
 * Outbound emails are recorded to the DB (see lib/email/index.ts) and logged.
 * Inbound payloads come from /api-test/email or POST /api/email/inbound.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  async sendEmail(email: OutboundEmail): Promise<SendResult> {
    const threadId = email.threadId || this.getThreadId({ subject: email.subject });
    console.log(`\n[MOCK EMAIL] → ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
    return { id: `mock-${cryptoId()}`, threadId, provider: this.name };
  }

  async sendEmailWithAttachment(
    email: OutboundEmail,
    attachments: OutboundAttachment[],
  ): Promise<SendResult> {
    const names = attachments.map((a) => a.filename).join(", ");
    console.log(
      `\n[MOCK EMAIL + ATTACHMENT] → ${email.to}\nSubject: ${email.subject}\nAttachments: ${names}\n${email.text}\n`,
    );
    const threadId = email.threadId || this.getThreadId({ subject: email.subject });
    return { id: `mock-${cryptoId()}`, threadId, provider: this.name };
  }

  parseInboundPayload(payload: unknown): InboundEmail {
    const p = (payload ?? {}) as Record<string, unknown>;
    return {
      fromEmail: String(p.fromEmail ?? p.from ?? ""),
      toEmail: String(p.toEmail ?? p.to ?? ""),
      subject: String(p.subject ?? ""),
      bodyText: String(p.bodyText ?? p.body ?? p.text ?? ""),
      providerThreadId: (p.providerThreadId as string) ?? (p.threadId as string) ?? null,
      providerMessageId: (p.providerMessageId as string) ?? null,
      internetMessageId: (p.internetMessageId as string) ?? null,
      conversationId:
        (p.conversationId as string) ?? (p.providerThreadId as string) ?? (p.threadId as string) ?? null,
      inReplyTo: (p.inReplyTo as string) ?? null,
      references: (p.references as string) ?? null,
      receivedAt: p.receivedAt ? new Date(String(p.receivedAt)) : new Date(),
      attachments: Array.isArray(p.attachments)
        ? (p.attachments as InboundEmail["attachments"])
        : [],
    };
  }

  getThreadId(input: { subject?: string | null; providerThreadId?: string | null }): string {
    if (input.providerThreadId) return input.providerThreadId;
    // Normalize subject (strip Re:/Fwd:) into a deterministic thread key.
    const base = (input.subject ?? "")
      .replace(/^(re|fwd|fw):\s*/gi, "")
      .trim()
      .toLowerCase();
    return `thread:${base || "no-subject"}`;
  }
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}
