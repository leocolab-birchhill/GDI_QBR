import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sendMonthlyCheckIn,
  send60DayDirectorReminder,
  send45DayMetricReminder,
  send30DayVpSummary,
  send14DayDraftReminder,
  sendFinalReviewReminder,
  sendPostQbrSurveys,
  rollForwardNextQbr,
} from "@/lib/jobs";

const JOBS = {
  monthlyCheckIn: sendMonthlyCheckIn,
  director60: send60DayDirectorReminder,
  metrics45: send45DayMetricReminder,
  vpSummary30: send30DayVpSummary,
  draft14: send14DayDraftReminder,
  finalReview: sendFinalReviewReminder,
  postQbrSurveys: sendPostQbrSurveys,
  rollForward: rollForwardNextQbr,
} as const;

const Schema = z.object({
  job: z.enum(Object.keys(JOBS) as [keyof typeof JOBS]),
  qbrCycleId: z.string(),
});

/**
 * Manual job runner. A cron scheduler can later POST here for due cycles.
 */
export async function POST(req: Request) {
  try {
    const { job, qbrCycleId } = Schema.parse(await req.json());
    const result = await JOBS[job](qbrCycleId);
    return NextResponse.json({ ok: true, job, result: result ?? null });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
