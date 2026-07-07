import { NextResponse } from "next/server";
import { sendPostQbrSurveys } from "@/lib/jobs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await sendPostQbrSurveys(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
