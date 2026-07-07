import { NextResponse } from "next/server";
import { z } from "zod";
import { recordApproval } from "@/lib/qbr/service";

const Schema = z.object({
  approverEmail: z.string().email(),
  status: z.enum(["approved", "revision_requested", "rejected"]).default("approved"),
  comments: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await req.json());
    const approval = await recordApproval({ qbrCycleId: params.id, ...body });
    return NextResponse.json({ ok: true, approval });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
