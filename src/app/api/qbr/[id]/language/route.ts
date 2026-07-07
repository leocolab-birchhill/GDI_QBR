import { NextResponse } from "next/server";
import { z } from "zod";
import { setDeckLanguage } from "@/lib/qbr/createWorkflow";
import { getQbrFull, readDeckOptions } from "@/lib/qbr/service";
import { LOCALES } from "@/lib/constants";
import type { SlideContent } from "@/lib/ai/schemas";

const Schema = z.object({ language: z.enum(LOCALES) });

/** Switch deck render language (PowerPoint labels/structure) and regenerate. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { language } = Schema.parse(await req.json());
    const result = await setDeckLanguage(params.id, language);
    let content: SlideContent | null = null;
    if (result.deck.contentJson) {
      try {
        content = JSON.parse(result.deck.contentJson) as SlideContent;
      } catch {
        content = null;
      }
    }
    const full = await getQbrFull(params.id);
    return NextResponse.json({
      ok: true,
      deckLanguage: language,
      deck: { fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber },
      content,
      options: readDeckOptions(full?.deckOptionsJson),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
