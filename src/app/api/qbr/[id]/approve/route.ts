import { NextResponse } from "next/server";
import { z } from "zod";
import { recordApproval } from "@/lib/qbr/service";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

const Schema = z.object({
  status: z.enum(["approved", "revision_requested", "rejected"]).default("approved"),
  comments: z.string().optional(),
  /** @deprecated Ignored — approver comes from SSO session. */
  approverEmail: z.string().email().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canApprove");
  if (!isQbrAccess(access)) return access;

  try {
    const body = Schema.parse(await req.json());
    const approval = await recordApproval({
      qbrCycleId: params.id,
      approverEmail: access.user.email,
      status: body.status,
      comments: body.comments,
    });
    return NextResponse.json({ ok: true, approval });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
