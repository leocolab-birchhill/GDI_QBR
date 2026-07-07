import { NextResponse } from "next/server";
import { z } from "zod";
import { recordApproval, generateDraft } from "@/lib/qbr/service";

const Schema = z.object({
  approverEmail: z.string().email(),
  revisionRequest: z.string(),
});

/** Record a revision request and regenerate the deck from current DB state. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await req.json());
    await recordApproval({
      qbrCycleId: params.id,
      approverEmail: body.approverEmail,
      status: "revision_requested",
      comments: body.revisionRequest,
    });
    const result = await generateDraft(params.id);
    return NextResponse.json({ ok: true, fileName: result.fileName, fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
