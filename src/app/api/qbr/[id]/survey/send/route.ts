import { NextResponse } from "next/server";
import { sendPostQbrSurveys } from "@/lib/jobs";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canEditDeck");
  if (!isQbrAccess(access)) return access;

  try {
    await sendPostQbrSurveys(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
