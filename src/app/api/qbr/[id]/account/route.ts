import { NextResponse } from "next/server";
import { z } from "zod";
import { renameQbrAccount } from "@/lib/qbr/createWorkflow";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

const Schema = z.object({ clientName: z.string().min(1).max(120) });

/** Rename the client/account attached to this QBR cycle. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canEditDeck");
  if (!isQbrAccess(access)) return access;

  try {
    const { clientName } = Schema.parse(await req.json());
    const name = await renameQbrAccount(params.id, clientName);
    return NextResponse.json({ ok: true, clientName: name });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
