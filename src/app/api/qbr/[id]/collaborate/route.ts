import { NextResponse } from "next/server";
import { z } from "zod";
import { editSlides } from "@/lib/ai";
import { hasOpenAi } from "@/lib/env";
import { buildAnswerContext } from "@/lib/qbr/answerContext";
import {
  applySlideEdits,
  generateDraft,
  getQbrFull,
  readDeckOptions,
} from "@/lib/qbr/service";
import { confirmGuidedSection, saveEditorMessage } from "@/lib/qbr/createWorkflow";
import { changedSectionsForOps } from "@/lib/ppt/slideManifest";
import { SlideEditOpSchema, type SlideContent } from "@/lib/ai/schemas";
import {
  getGuidedPrompt,
  readEditorProgress,
  getStrings,
  type GuidedSection,
} from "@/lib/i18n";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";

const Schema = z.object({
  message: z.string().optional(),
  operations: z.array(SlideEditOpSchema).optional(),
  actorEmail: z.string().optional(),
  actorName: z.string().optional(),
  confirmSection: z.string().optional(),
}).refine((v) => (v.message?.trim() || v.operations?.length), {
  message: "Provide a message or at least one edit operation",
});

const CONFIRM_PATTERNS = /^(confirm|confirmer|ok|next|suivant|done|terminé)\.?$/i;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await req.json());
    const { operations, actorEmail, actorName, confirmSection } = body;
    const message = body.message?.trim() ?? "";

    const full = await getQbrFull(params.id);
    if (!full) return NextResponse.json({ error: "QBR not found" }, { status: 404 });

    const uiLocale = getServerUiLocale();
    const strings = getStrings(uiLocale);
    const progress = readEditorProgress(full.editorProgressJson);

    if (message) {
      await saveEditorMessage({
        qbrCycleId: params.id,
        role: "user",
        text: message,
        actorEmail,
        actorName,
      });
    }

    if (operations?.length) {
      const applied = await applySlideEdits(params.id, operations);
      const changed = applied.length > 0;
      let deck: { fileName: string; fileUrl: string; versionNumber: number } | null = null;
      let content: SlideContent | null = null;
      let options: Record<string, unknown> = {};

      if (changed) {
        const result = await generateDraft(params.id, { skipAi: true });
        deck = { fileName: result.fileName, fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber };
        if (result.deck.contentJson) {
          try {
            content = JSON.parse(result.deck.contentJson) as SlideContent;
          } catch {
            content = null;
          }
        }
        const refreshed = await getQbrFull(params.id);
        options = readDeckOptions(refreshed?.deckOptionsJson);
      } else {
        options = readDeckOptions(full.deckOptionsJson);
      }

      const changedSections = changedSectionsForOps(operations.map((o) => o.type));
      const reply = changed
        ? applied.join("\n")
        : uiLocale === "fr"
          ? "Aucune modification appliquee."
          : "No changes applied.";

      return NextResponse.json({
        ok: true,
        reply,
        applied,
        deck,
        content,
        options,
        changedSections,
        suggestions: [],
        changed,
        aiEnabled: hasOpenAi(),
        editorProgress: progress,
        messageId: null,
      });
    }

    const isConfirm =
      confirmSection || (progress.guidedMode && CONFIRM_PATTERNS.test(message.trim()));

    if (isConfirm && progress.guidedMode) {
      const section = (confirmSection ?? progress.currentSection) as GuidedSection;
      const updated = await confirmGuidedSection(params.id, section, actorEmail);
      const nextSection = updated.currentSection as GuidedSection;
      const allDone = updated.confirmedSections.length >= 7;

      let reply: string;
      if (allDone) {
        reply = strings.editor.allConfirmed;
      } else {
        reply = `${strings.editor.confirmed(strings.editor.sections[section])}\n\n${getGuidedPrompt(nextSection, uiLocale)}`;
      }

      const assistantMsg = await saveEditorMessage({
        qbrCycleId: params.id,
        role: "assistant",
        text: reply,
        metadata: { guided: true, section, nextSection },
      });

      return NextResponse.json({
        ok: true,
        reply,
        applied: [],
        deck: null,
        content: null,
        options: readDeckOptions(full.deckOptionsJson),
        changedSections: [section],
        suggestions: allDone ? [] : [strings.editor.confirm],
        changed: false,
        aiEnabled: hasOpenAi(),
        editorProgress: updated,
        messageId: assistantMsg.id,
      });
    }

    const edit = await editSlides({ message, context: buildAnswerContext(full) });
    const applied = await applySlideEdits(params.id, edit.operations);

    const changed = applied.length > 0;
    let deck: { fileName: string; fileUrl: string; versionNumber: number } | null = null;
    let content: SlideContent | null = null;
    let options: Record<string, unknown> = {};
    let changedSections: string[] = [];

    if (edit.regenerate && changed) {
      const result = await generateDraft(params.id, { skipAi: true });
      deck = { fileName: result.fileName, fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber };
      if (result.deck.contentJson) {
        try {
          content = JSON.parse(result.deck.contentJson) as SlideContent;
        } catch {
          content = null;
        }
      }
      const refreshed = await getQbrFull(params.id);
      options = readDeckOptions(refreshed?.deckOptionsJson);
      changedSections = changedSectionsForOps(edit.operations.map((o) => o.type));
    }

    let reply =
      !changed && edit.operations.length > 0
        ? uiLocale === "fr"
          ? "Je n'ai rien pu modifier — l'élément était déjà défini, déjà présent, ou introuvable. Essayez de nommer l'élément exact et la nouvelle valeur."
          : "I couldn't change anything with that — the item(s) I matched were already set, already present, or I couldn't find them on the deck. Try naming the exact slide item and the new value."
        : edit.reply;

    if (progress.guidedMode && changed) {
      reply += `\n\n${getGuidedPrompt(progress.currentSection, uiLocale)}`;
    }

    const assistantMsg = await saveEditorMessage({
      qbrCycleId: params.id,
      role: "assistant",
      text: reply,
      metadata: { applied, deck, suggestions: edit.suggestions },
    });

    return NextResponse.json({
      ok: true,
      reply,
      applied,
      deck,
      content,
      options,
      changedSections,
      suggestions: edit.suggestions,
      changed,
      aiEnabled: hasOpenAi(),
      editorProgress: progress,
      messageId: assistantMsg.id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
