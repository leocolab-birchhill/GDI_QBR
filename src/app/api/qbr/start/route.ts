import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processInboundEmail } from "@/lib/qbr/orchestrator";
import { env } from "@/lib/env";

const StartSchema = z.object({
  fromEmail: z.string().email(),
  clientName: z.string(),
  quarter: z.string(),
  year: z.coerce.number(),
  meetingDate: z.string().optional(),
  vp: z.string().optional(),
  director: z.string().optional(),
});

/** Programmatic QBR start (alternative to email). Builds a synthetic CREATE_QBR email. */
export async function POST(req: NextRequest) {
  try {
    const body = StartSchema.parse(await req.json());
    const result = await processInboundEmail({
      fromEmail: body.fromEmail,
      toEmail: env.QBR_MAILBOX,
      subject: `Start QBR - ${body.clientName} - ${body.quarter} ${body.year}`,
      bodyText: `Client: ${body.clientName}\nQuarter: ${body.quarter} ${body.year}\n${body.meetingDate ? `Meeting date: ${body.meetingDate}\n` : ""}${body.vp ? `VP: ${body.vp}\n` : ""}${body.director ? `Director: ${body.director}\n` : ""}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
