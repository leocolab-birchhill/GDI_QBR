import { NextResponse } from "next/server";
import { z } from "zod";
import { setGuidedSection } from "@/lib/qbr/createWorkflow";
import { getGuidedPrompt, GUIDED_SECTIONS, type GuidedSection } from "@/lib/i18n";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

const Schema = z.object({
  section: z.string().refine((s): s is GuidedSection => (GUIDED_SECTIONS as readonly string[]).includes(s), {
    message: "Unknown section",
  }),
  completed: z.boolean().optional(),
});

/** Jump the guided editor back/forward to a section so the user can revise it. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id, "canEditDeck");
  if (!isQbrAccess(access)) return access;

  try {
    const { section, completed } = Schema.parse(await req.json());
    const editorProgress = await setGuidedSection(params.id, section as GuidedSection, completed);
    const uiLocale = getServerUiLocale();
    return NextResponse.json({
      ok: true,
      editorProgress,
      prompt: getGuidedPrompt(section as GuidedSection, uiLocale),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
