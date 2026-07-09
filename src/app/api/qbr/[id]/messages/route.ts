import { NextResponse } from "next/server";
import { loadEditorMessages } from "@/lib/qbr/createWorkflow";

/** Load persisted collaborative editor messages. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const section = url.searchParams.get("section");
  const messages = await loadEditorMessages(
    params.id,
    since ? new Date(since) : undefined,
    section || undefined,
  );
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      section: m.section,
      actorEmail: m.actorEmail,
      actorName: m.actorName,
      metadataJson: m.metadataJson,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}
