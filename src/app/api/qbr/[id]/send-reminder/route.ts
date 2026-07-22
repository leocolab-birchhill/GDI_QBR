import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sendMonthlyCheckIn,
  send60DayDirectorReminder,
  send45DayMetricReminder,
  send30DayVpSummary,
  send14DayDraftReminder,
  sendFinalReviewReminder,
} from "@/lib/jobs";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

const REMINDERS = {
  monthly: sendMonthlyCheckIn,
  director60: send60DayDirectorReminder,
  metrics45: send45DayMetricReminder,
  vp30: send30DayVpSummary,
  draft14: send14DayDraftReminder,
  finalReview: sendFinalReviewReminder,
} as const;

const Schema = z.object({ type: z.enum(Object.keys(REMINDERS) as [keyof typeof REMINDERS]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canEditDeck");
  if (!isQbrAccess(access)) return access;

  try {
    const { type } = Schema.parse(await req.json());
    await REMINDERS[type](params.id);
    return NextResponse.json({ ok: true, type });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
