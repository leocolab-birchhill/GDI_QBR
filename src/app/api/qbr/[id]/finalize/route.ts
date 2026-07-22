import { NextResponse } from "next/server";
import { z } from "zod";
import { finalize, FinalizationBlockedError } from "@/lib/qbr/service";
import { getSettings } from "@/lib/qbr/settings";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

const Schema = z.object({ allowOverride: z.boolean().optional() }).optional();

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canFinalize");
  if (!isQbrAccess(access)) return access;

  try {
    const body = (await req.json().catch(() => ({}))) ?? {};
    const parsed = Schema.parse(body) ?? {};
    const settings = await getSettings();
    const allowOverride = parsed.allowOverride ?? settings.allowFinalizeOverride;
    const result = await finalize(params.id, { allowOverride });
    return NextResponse.json({ ok: true, fileName: result.fileName, fileUrl: result.fileUrl });
  } catch (err) {
    if (err instanceof FinalizationBlockedError) {
      return NextResponse.json({ error: err.reason, blocked: true }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
