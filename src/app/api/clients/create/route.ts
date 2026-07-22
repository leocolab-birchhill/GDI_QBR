import { NextResponse } from "next/server";
import { z } from "zod";
import { createClientWithBlankQbr } from "@/lib/qbr/createWorkflow";
import { LOCALES } from "@/lib/constants";
import { isAuthUser, requireCapabilityApi } from "@/lib/auth";

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
  const user = await requireCapabilityApi(req, "canEditDeck");
  if (!isAuthUser(user)) return user;

  try {
    const body = Schema.parse(await req.json());

    // Default ownership to the creating user when their role matches.
    const owners = {
      vpOwnerId: body.vpOwnerId,
      directorId: body.directorId,
      accountManagerId: body.accountManagerId,
    };
    if (user.role === "VP" && !owners.vpOwnerId) owners.vpOwnerId = user.id;
    if (user.role === "Director" && !owners.directorId) owners.directorId = user.id;
    if (user.role === "AccountManager" && !owners.accountManagerId) {
      owners.accountManagerId = user.id;
    }

    const result = await createClientWithBlankQbr({
      ...body,
      ...owners,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : null,
      createdById: user.id,
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
