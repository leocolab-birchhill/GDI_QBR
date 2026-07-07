import { NextResponse } from "next/server";
import { getConnectedAccount, isGraphConfigured } from "@/lib/email/providers/graphAuth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const acct = await getConnectedAccount();
  return NextResponse.json({
    provider: env.EMAIL_PROVIDER,
    configured: isGraphConfigured(),
    connected: Boolean(acct?.refreshToken),
    email: acct?.email ?? null,
    mailbox: env.QBR_MAILBOX,
    senderName: env.EMAIL_SENDER_NAME,
    expiresAt: acct?.expiresAt ?? null,
    scope: acct?.scope ?? null,
  });
}
