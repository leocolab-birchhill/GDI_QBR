import { NextResponse } from "next/server";
import { generateDraft } from "@/lib/qbr/service";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canEditDeck");
  if (!isQbrAccess(access)) return access;

  try {
    let body: { skipAi?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const result = await generateDraft(params.id, { skipAi: body.skipAi });
    return NextResponse.json({
      ok: true,
      fileName: result.fileName,
      fileUrl: result.fileUrl,
      downloadUrl: result.downloadUrl,
      versionNumber: result.deck.versionNumber,
      unconfirmed: result.unconfirmed,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
