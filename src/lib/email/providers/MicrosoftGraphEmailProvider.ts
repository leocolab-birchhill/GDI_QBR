import { env } from "../../env";
import {
  EmailProvider,
  InboundEmail,
  OutboundAttachment,
  OutboundEmail,
  SendResult,
} from "./EmailProvider";
import { getValidAccessToken, isGraphConfigured } from "./graphAuth";

/**
 * Microsoft Graph email provider (delegated auth).
 *
 * Sends as the connected mailbox (e.g. qdr_intelligence@outlook.com) via
 * POST /me/sendMail. Auth/refresh is handled in graphAuth.ts; connect once at
 * /api/outlook/login.
 *
 * Inbound: use /api/outlook/poll to pull recent inbox messages (no public URL
 * required). A push subscription/webhook can replace polling later.
 */
const GRAPH = "https://graph.microsoft.com/v1.0";

export class MicrosoftGraphEmailProvider implements EmailProvider {
  readonly name = "graph";

  constructor() {
    if (!isGraphConfigured()) {
      console.warn(
        "[graph] MICROSOFT_CLIENT_ID/SECRET not set — set them in .env to use the Graph provider.",
      );
    }
  }

  async sendEmail(email: OutboundEmail): Promise<SendResult> {
    return this.send(email, []);
  }

  async sendEmailWithAttachment(
    email: OutboundEmail,
    attachments: OutboundAttachment[],
  ): Promise<SendResult> {
    return this.send(email, attachments);
  }

  private async send(email: OutboundEmail, attachments: OutboundAttachment[]): Promise<SendResult> {
    // Reply in-thread when we know the original provider message id. Falls back
    // to a fresh send (with "Re:" subject) when the reply API is unavailable.
    if (email.replyToProviderMessageId) {
      try {
        return await this.sendReply(email, attachments, email.replyToProviderMessageId);
      } catch (err) {
        console.warn(
          "[graph] reply API failed, falling back to a new message:",
          (err as Error).message,
        );
      }
    }
    return this.sendNew(email, attachments);
  }

  /**
   * Send a reply in the original conversation using Graph's createReply pattern:
   *   1. POST /messages/{id}/createReply  → creates a draft reply (preserves
   *      conversationId, Re: subject, In-Reply-To/References headers)
   *   2. PATCH /messages/{draftId}        → set our body/content
   *   3. POST  /messages/{draftId}/attachments (per attachment, if any)
   *   4. POST  /messages/{draftId}/send
   */
  private async sendReply(
    email: OutboundEmail,
    attachments: OutboundAttachment[],
    originalMessageId: string,
  ): Promise<SendResult> {
    const token = await getValidAccessToken();
    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const createRes = await fetch(
      `${GRAPH}/me/messages/${encodeURIComponent(originalMessageId)}/createReply`,
      { method: "POST", headers: authHeaders },
    );
    if (!createRes.ok) {
      throw new Error(`Graph createReply failed (${createRes.status}): ${await createRes.text()}`);
    }
    const draft = (await createRes.json()) as {
      id: string;
      conversationId?: string;
      body?: { contentType?: string; content?: string };
    };
    // Graph message ids contain URL-unsafe characters (/, +, =) — every
    // subsequent call MUST encode the id or it 400/404s and we lose threading.
    const draftId = encodeURIComponent(draft.id);

    // createReply pre-fills the draft body with the quoted original message (the
    // normal "From/Sent/Subject + previous text" history block). PREPEND our new
    // content to that instead of replacing it, so each reply keeps the full
    // conversation history visible in the normal Outlook reply flow.
    const quoted = await this.getDraftBody(token, draftId, draft.body?.content ?? "");
    const ourHtml = email.html ?? `<div>${escapeHtmlContent(email.text)}</div>`;
    const combined = quoted
      ? `${ourHtml}<br/><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>${quoted}`
      : ourHtml;

    const patchRes = await fetch(`${GRAPH}/me/messages/${draftId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        body: { contentType: "HTML", content: combined },
      }),
    });
    if (!patchRes.ok) {
      throw new Error(`Graph reply update failed (${patchRes.status}): ${await patchRes.text()}`);
    }

    for (const a of attachments) {
      const attRes = await fetch(`${GRAPH}/me/messages/${draftId}/attachments`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.contentType,
          contentBytes: a.content.toString("base64"),
        }),
      });
      if (!attRes.ok) {
        throw new Error(`Graph reply attachment failed (${attRes.status}): ${await attRes.text()}`);
      }
    }

    const sendRes = await fetch(`${GRAPH}/me/messages/${draftId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!sendRes.ok) {
      throw new Error(`Graph reply send failed (${sendRes.status}): ${await sendRes.text()}`);
    }

    console.log(
      `[graph] sent in-thread reply (conversationId=${draft.conversationId ?? "?"}) to ${email.to}`,
    );
    return {
      id: draft.id,
      threadId:
        draft.conversationId ||
        email.threadId ||
        this.getThreadId({ subject: email.subject }),
      provider: this.name,
    };
  }

  /**
   * Return the draft's quoted-history HTML. Uses the body already returned by
   * createReply when present; otherwise GETs the draft (some Graph responses
   * omit body). Returns "" if it can't be read so the reply still sends.
   */
  private async getDraftBody(token: string, draftId: string, inlineBody: string): Promise<string> {
    if (inlineBody && inlineBody.trim()) return inlineBody;
    try {
      const res = await fetch(`${GRAPH}/me/messages/${draftId}?$select=body`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { body?: { content?: string } };
      return data.body?.content ?? "";
    } catch {
      return "";
    }
  }

  private async sendNew(email: OutboundEmail, attachments: OutboundAttachment[]): Promise<SendResult> {
    const token = await getValidAccessToken();

    const message: Record<string, unknown> = {
      subject: email.subject,
      body: {
        contentType: email.html ? "HTML" : "Text",
        content: email.html ?? email.text,
      },
      toRecipients: [{ emailAddress: { address: email.to } }],
    };

    if (attachments.length > 0) {
      message.attachments = attachments.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.content.toString("base64"),
      }));
    }

    const res = await fetch(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Graph sendMail failed (${res.status}): ${detail}`);
    }

    return {
      id: `graph-${Date.now()}`,
      threadId: email.threadId || this.getThreadId({ subject: email.subject }),
      provider: this.name,
    };
  }

  parseInboundPayload(payload: unknown): InboundEmail {
    // Maps a Graph "message" resource into our normalized shape.
    const m = (payload ?? {}) as Record<string, any>;
    return {
      fromEmail: m?.from?.emailAddress?.address ?? m?.sender?.emailAddress?.address ?? "",
      toEmail: m?.toRecipients?.[0]?.emailAddress?.address ?? env.QBR_MAILBOX,
      subject: m?.subject ?? "",
      bodyText: stripHtml(m?.body?.content ?? m?.bodyPreview ?? ""),
      providerThreadId: m?.conversationId ?? null,
      providerMessageId: m?.id ?? null,
      internetMessageId: m?.internetMessageId ?? null,
      conversationId: m?.conversationId ?? null,
      inReplyTo: m?.internetMessageHeaders?.find?.(
        (h: any) => String(h?.name).toLowerCase() === "in-reply-to",
      )?.value ?? null,
      references: m?.internetMessageHeaders?.find?.(
        (h: any) => String(h?.name).toLowerCase() === "references",
      )?.value ?? null,
      receivedAt: m?.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
      attachments: [],
    };
  }

  getThreadId(input: { subject?: string | null; providerThreadId?: string | null }): string {
    return input.providerThreadId ?? `graph:${(input.subject ?? "").replace(/^(re|fwd|fw):\s*/gi, "").trim().toLowerCase()}`;
  }
}

function escapeHtmlContent(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
