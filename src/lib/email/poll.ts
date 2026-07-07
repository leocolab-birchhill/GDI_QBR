import { env } from "../env";
import { getEmailProvider } from ".";
import {
  getConnectedAccount,
  getValidAccessToken,
  isGraphConfigured,
} from "./providers/graphAuth";
import { processInboundEmail } from "../qbr/orchestrator";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface PollResult {
  ok: boolean;
  count: number;
  skipped?: number;
  processed: { subject: string; intent: string; qbrCycleId: string | null }[];
  reason?: string;
}

/**
 * Poll the connected mailbox for unread inbox messages and run each through the
 * full QBR pipeline (classify → extract → route → reply), then mark them read so
 * they are not reprocessed.
 *
 * This is what makes the bot respond to REAL human emails (not just the
 * front-end simulator). It is called both by POST /api/outlook/poll and by the
 * background poller (src/instrumentation.ts) on an interval.
 *
 * Messages the mailbox sent to itself are skipped to avoid reply loops.
 */
export async function pollAndProcessInbox(): Promise<PollResult> {
  if (env.EMAIL_PROVIDER !== "graph") {
    return { ok: false, count: 0, processed: [], reason: "EMAIL_PROVIDER is not 'graph'" };
  }
  if (!isGraphConfigured()) {
    return { ok: false, count: 0, processed: [], reason: "Microsoft Graph is not configured" };
  }
  const acct = await getConnectedAccount();
  if (!acct?.refreshToken) {
    return { ok: false, count: 0, processed: [], reason: "Mailbox not connected (visit /api/outlook/login)" };
  }

  const token = await getValidAccessToken();
  const url =
    `${GRAPH}/me/mailFolders/inbox/messages` +
    `?$filter=isRead eq false&$top=10&$orderby=receivedDateTime asc` +
    `&$select=id,subject,from,toRecipients,body,bodyPreview,conversationId,internetMessageId,internetMessageHeaders,receivedDateTime`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, count: 0, processed: [], reason: `Graph fetch failed (${res.status}): ${detail.slice(0, 200)}` };
  }

  const data = (await res.json()) as { value: any[] };
  const provider = getEmailProvider();
  const selfAddresses = new Set(
    [acct.email, env.QBR_MAILBOX].filter(Boolean).map((a) => String(a).toLowerCase()),
  );

  const processed: PollResult["processed"] = [];
  let skipped = 0;

  for (const msg of data.value ?? []) {
    const inbound = provider.parseInboundPayload(msg);

    // Skip junk and self-sent messages (avoids reply loops).
    if (!inbound.fromEmail || selfAddresses.has(inbound.fromEmail.toLowerCase())) {
      skipped++;
      await markRead(token, msg.id);
      continue;
    }

    try {
      const result = await processInboundEmail(inbound);
      processed.push({ subject: inbound.subject, intent: result.intent, qbrCycleId: result.qbrCycleId });
    } catch (err) {
      console.error("[poll] failed processing message:", inbound.subject, (err as Error).message);
    } finally {
      // Mark read regardless so a single bad message doesn't block the queue.
      await markRead(token, msg.id);
    }
  }

  return { ok: true, count: processed.length, skipped, processed };
}

async function markRead(token: string, id: string): Promise<void> {
  await fetch(`${GRAPH}/me/messages/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ isRead: true }),
  }).catch(() => undefined);
}
