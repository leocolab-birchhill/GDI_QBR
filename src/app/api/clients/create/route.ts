import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientWithBlankQbr } from "@/lib/qbr/createWorkflow";
import { LOCALES } from "@/lib/constants";

const Schema = z.object({
  clientName: z.string().min(1),
  quarter: z.string().optional(),
  year: z.coerce.number().int().optional(),
  meetingDate: z.string().optional(),
  language: z.enum(LOCALES).optional(),
  logoUrl: z.string().optional(),
  region: z.string().optional(),
  vpOwnerId: z.string().optional(),
  directorId: z.string().optional(),
  accountManagerId: z.string().optional(),
  stakeholderEmails: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Create a new client account and generate a blank QBR deck. */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const result = await createClientWithBlankQbr({
      ...body,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
    });
    return NextResponse.json({
      ok: true,
      account: result.account,
      qbrCycleId: result.cycle.id,
      editorUrl: `/qbr/${result.cycle.id}/collaborate`,
      deck: result.draft
        ? { fileUrl: result.draft.fileUrl, versionNumber: result.draft.deck.versionNumber }
        : null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
