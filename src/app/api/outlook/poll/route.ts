import { NextResponse } from "next/server";
import { pollAndProcessInbox } from "@/lib/email/poll";

export const dynamic = "force-dynamic";

/**
 * Poll the connected mailbox for unread inbox messages and run each through the
 * QBR pipeline, then mark them read so they aren't reprocessed.
 *
 * This enables real inbound email WITHOUT a public webhook URL. The same logic
 * also runs automatically on an interval (see src/instrumentation.ts), so this
 * route is mainly for manual triggering / debugging.
 */
export async function POST() {
  try {
    const result = await pollAndProcessInbox();
    const status = result.ok ? 200 : 409;
    return NextResponse.json(result, { status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
