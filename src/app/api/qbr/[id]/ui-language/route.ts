import { NextResponse } from "next/server";
import { z } from "zod";
import { setUiLocale } from "@/lib/qbr/createWorkflow";
import { getQbrFull, readDeckOptions } from "@/lib/qbr/service";
import { LOCALES } from "@/lib/constants";

const Schema = z.object({ uiLocale: z.enum(LOCALES) });

/** Switch editor/site UI language (workflow, chat, prompts). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { uiLocale } = Schema.parse(await req.json());
    const saved = await setUiLocale(params.id, uiLocale);
    const full = await getQbrFull(params.id);
    return NextResponse.json({
      ok: true,
      uiLocale: saved,
      options: readDeckOptions(full?.deckOptionsJson),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
