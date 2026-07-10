import { NextResponse } from "next/server";
import { generateDraft } from "@/lib/qbr/service";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    let body: { skipAi?: boolean } = {};
    try {
      body = await _req.json();
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
