/**
 * Provider-agnostic email interface. Concrete providers (Mock, Microsoft Graph,
 * SendGrid, Mailgun, Postmark) implement this so the rest of the app never
 * depends on a specific vendor.
 */

export interface OutboundEmail {
  to: string;
  from?: string;
  subject: string;
  html?: string;
  text: string;
  threadId?: string | null;
  inReplyTo?: string | null;
  /**
   * Original provider message id we are replying to. When set, providers that
   * support a reply API (e.g. Microsoft Graph createReply) send the response
   * in-thread instead of as a brand-new message.
   */
  replyToProviderMessageId?: string | null;
  /** RFC 5322 References header value, accumulated across the thread. */
  references?: string | null;
}

export interface OutboundAttachment {
  filename: string;
  contentType: string;
  /** Raw bytes of the attachment. */
  content: Buffer;
}

export interface SendResult {
  id: string;
  threadId: string;
  provider: string;
}

/**
 * Normalized inbound email payload produced from a raw provider webhook body.
 */
export interface InboundEmail {
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  providerThreadId?: string | null;
  providerMessageId?: string | null;
  /** RFC 5322 Message-ID (Graph: internetMessageId). */
  internetMessageId?: string | null;
  /** Provider conversation id (Graph: conversationId). */
  conversationId?: string | null;
  /** Message-ID this email is a reply to (from In-Reply-To header). */
  inReplyTo?: string | null;
  /** Accumulated References header (space-separated Message-IDs). */
  references?: string | null;
  receivedAt?: Date;
  attachments?: {
    filename: string;
    mimeType?: string;
    /** Optional already-extracted text (e.g. previous QBR notes). */
    extractedText?: string;
    contentBase64?: string;
  }[];
}

export interface EmailProvider {
  readonly name: string;

  sendEmail(email: OutboundEmail): Promise<SendResult>;

  sendEmailWithAttachment(
    email: OutboundEmail,
    attachments: OutboundAttachment[],
  ): Promise<SendResult>;

  /** Parse a raw provider-specific webhook payload into a normalized InboundEmail. */
  parseInboundPayload(payload: unknown): InboundEmail;

  /** Derive/normalize a stable thread id for a given subject/message. */
  getThreadId(input: { subject?: string | null; providerThreadId?: string | null }): string;
}
