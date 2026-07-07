import { NextRequest, NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email";
import { MockEmailProvider } from "@/lib/email/providers/MockEmailProvider";
import { processInboundEmail } from "@/lib/qbr/orchestrator";

/**
 * Inbound email webhook. In dev this is driven by /api-test/email. In prod a
 * real provider (Microsoft Graph, SendGrid, etc.) posts its native payload here;
 * the active provider normalizes it via parseInboundPayload().
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    // The dev simulator (and generic clients) post an already-normalized payload
    // ({fromEmail, subject, bodyText, ...}); real provider webhooks post their
    // native shape. Use the normalized payload directly when present so the
    // simulator works regardless of the configured EMAIL_PROVIDER.
    const p = (payload ?? {}) as Record<string, unknown>;
    const isNormalized = typeof p.fromEmail === "string" && typeof p.subject === "string";
    const provider = getEmailProvider();
    const inbound = isNormalized
      ? new MockEmailProvider().parseInboundPayload(payload)
      : provider.parseInboundPayload(payload);
    if (!inbound.fromEmail || !inbound.subject) {
      return NextResponse.json({ error: "Missing fromEmail or subject" }, { status: 400 });
    }
    const result = await processInboundEmail(inbound);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/email/inbound] error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
