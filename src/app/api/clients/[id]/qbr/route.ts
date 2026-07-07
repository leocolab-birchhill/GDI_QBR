import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createBlankQbr } from "@/lib/qbr/createWorkflow";
import { LOCALES } from "@/lib/constants";

/** List this client's existing QBR cycles (newest first) for the editor picker. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const account = await prisma.account.findUnique({
    where: { id: params.id },
    include: {
      qbrCycles: {
        orderBy: [{ year: "desc" }, { quarter: "desc" }, { updatedAt: "desc" }],
        include: { deckVersions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      },
    },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({
    account: { id: account.id, clientName: account.clientName, logoUrl: account.logoUrl, language: account.language },
    cycles: account.qbrCycles.map((c) => ({
      id: c.id,
      quarter: c.quarter,
      year: c.year,
      status: c.status,
      updatedAt: c.updatedAt,
      latestDeckVersion: c.deckVersions[0]?.versionNumber ?? null,
      editorUrl: `/qbr/${c.id}/collaborate`,
    })),
  });
}

const Schema = z.object({
  quarter: z.string().optional(),
  year: z.coerce.number().int().optional(),
  meetingDate: z.string().optional(),
  language: z.enum(LOCALES).optional(),
});

/** Create a blank QBR for an existing client account. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await req.json());
    const result = await createBlankQbr({
      accountId: params.id,
      quarter: body.quarter,
      year: body.year,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
      language: body.language,
    });
    return NextResponse.json({
      ok: true,
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
