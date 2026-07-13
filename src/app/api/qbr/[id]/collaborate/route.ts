import { NextResponse } from "next/server";
import { z } from "zod";
import { editSlides, reviewForClientSafety } from "@/lib/ai";
import { hasOpenAi } from "@/lib/env";
import { buildEditorContext } from "@/lib/qbr/editorContext";
import { changedSectionsForPatches } from "@/lib/qbr/deckPatches";
import {
  applySlideEdits,
  generateDraft,
  getQbrFull,
  readDeckOptions,
} from "@/lib/qbr/service";
import { confirmGuidedSection, saveEditorMessage } from "@/lib/qbr/createWorkflow";
import { changedSectionsForOps } from "@/lib/ppt/slideManifest";
import { getSectionReview, primarySectionForOps } from "@/lib/qbr/sectionGuidance";
import {
  SlideEditOpSchema,
  DeckPatchSchema,
  FieldChangeSchema,
  type EditorProposal,
  type SlideContent,
  type SlideEditOp,
  type DeckPatch,
} from "@/lib/ai/schemas";
import {
  acceptEditorProposal,
  createEditorProposal,
  rejectEditorProposal,
  undoLastEditorChange,
} from "@/lib/qbr/editorChangeSets";
import { applyDeckPatches } from "@/lib/qbr/deckPatches";
import {
  getGuidedPrompt,
  readEditorProgress,
  getStrings,
  GUIDED_SECTIONS,
  type GuidedSection,
} from "@/lib/i18n";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";

const GuidedTaskSchema = z.object({
  id: z.string(),
  section: z.string(),
  question: z.string(),
  rationale: z.string().optional(),
  fields: z.array(z.object({
    key: z.string(),
    label: z.string(),
    inputType: z.string(),
    required: z.boolean().optional(),
    validation: z.unknown().optional(),
  })).optional(),
  priority: z.number().optional(),
  complete: z.boolean().optional(),
}).passthrough();

const Schema = z.object({
  message: z.string().optional(),
  operations: z.array(SlideEditOpSchema).optional(),
  patches: z.array(DeckPatchSchema).optional(),
  action: z.enum(["propose", "accept", "reject", "undo", "direct"]).optional(),
  changeSetId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorName: z.string().optional(),
  confirmSection: z.string().optional(),
  activeSection: z.string().optional(),
  inputSource: z.enum(["activity_chat", "guided_answer"]).optional(),
  guidedTask: GuidedTaskSchema.nullish(),
}).refine((v) => v.message?.trim() || v.operations?.length || v.patches?.length || v.action === "accept" || v.action === "reject" || v.action === "undo", {
  message: "Provide a message, edit operation, deck patch, or proposal action",
});

const CONFIRM_PATTERNS = /^(confirm|confirmer|ok|next|suivant|done|terminé)\.?$/i;

function isoInputDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function latestDeckSnapshot(full: Awaited<ReturnType<typeof getQbrFull>>) {
  const latest = full?.deckVersions[full.deckVersions.length - 1];
  let content: SlideContent | null = null;
  if (latest?.contentJson) {
    try {
      content = JSON.parse(latest.contentJson) as SlideContent;
    } catch {
      content = null;
    }
  }
  return {
    content,
    deck: latest
      ? { fileName: latest.title, fileUrl: latest.fileUrl, versionNumber: latest.versionNumber }
      : null,
    options: readDeckOptions(full?.deckOptionsJson),
    editorProgress: readEditorProgress(full?.editorProgressJson),
    meetingDate: isoInputDate(full?.meetingDate),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const full = await getQbrFull(params.id);
  if (!full) return NextResponse.json({ error: "QBR not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...latestDeckSnapshot(full) });
}

function fieldChangesForOps(
  operations: SlideEditOp[],
  full: Awaited<ReturnType<typeof getQbrFull>>,
): z.infer<typeof FieldChangeSchema>[] {
  if (!full) return [];
  return operations.map((op) => {
    const field = op.label ?? op.title ?? op.action ?? op.type;
    let before: unknown = null;
    if (op.type === "set_metric" && op.label) {
      before = full.dashboardMetrics.find((m) => m.label.toLowerCase() === op.label?.toLowerCase())?.value ?? null;
    } else if (op.type === "set_client_name") {
      before = full.account.clientName;
    } else if (op.type === "set_meeting_date") {
      before = full.meetingDate?.toISOString() ?? null;
    } else if (op.type === "set_agenda") {
      before = full.agendaSectionsJson ? JSON.parse(full.agendaSectionsJson) : null;
    }
    const after = op.value ?? op.date ?? op.explanation ?? op.detail ?? op.body ?? op.status ?? op.title ?? op.action ?? null;
    return { field, before, after };
  });
}

function clientFacingText(operations: SlideEditOp[]): string {
  return operations
    .flatMap((op) => [op.title, op.explanation, op.detail, op.body, op.action, op.value])
    .filter((v): v is string => typeof v === "string" && !!v.trim())
    .join("\n");
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = Schema.parse(await req.json());
    const { operations, patches, actorEmail, actorName, confirmSection, activeSection, action, changeSetId, inputSource, guidedTask } = body;
    const message = body.message?.trim() ?? "";

    const full = await getQbrFull(params.id);
    if (!full) return NextResponse.json({ error: "QBR not found" }, { status: 404 });

    const uiLocale = getServerUiLocale();
    const strings = getStrings(uiLocale);
    const progress = readEditorProgress(full.editorProgressJson);
    const threadSection = activeSection ?? progress.currentSection;

    if (action === "reject") {
      if (!changeSetId) return NextResponse.json({ error: "changeSetId is required" }, { status: 400 });
      await rejectEditorProposal(params.id, changeSetId, actorEmail);
      return NextResponse.json({ ok: true, changed: false, proposalStatus: "rejected" });
    }

    if (action === "accept") {
      if (!changeSetId) return NextResponse.json({ error: "changeSetId is required" }, { status: 400 });
      const accepted = await acceptEditorProposal(params.id, changeSetId, actorEmail);
      const result = await generateDraft(params.id, { skipAi: true });
      const content = result.deck.contentJson
        ? JSON.parse(result.deck.contentJson) as SlideContent
        : null;
      const refreshed = await getQbrFull(params.id);
      const changedSections = [
        ...changedSectionsForOps(accepted.operations.map((op) => op.type)),
        ...changedSectionsForPatches(accepted.patches),
      ];
      const deck = { fileName: result.fileName, fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber };
      await saveEditorMessage({
        qbrCycleId: params.id,
        role: "assistant",
        text: accepted.changes.length ? accepted.changes.join("\n") : uiLocale === "fr" ? "Aucune modification appliquée." : "No changes applied.",
        section: threadSection,
        metadata: { applied: accepted.changes, deck, changeSetId, proposalStatus: "applied" },
      });
      return NextResponse.json({
        ok: true,
        changed: accepted.changes.length > 0,
        proposalStatus: "applied",
        applied: accepted.changes,
        content,
        deck,
        options: readDeckOptions(refreshed?.deckOptionsJson),
        meetingDate: isoInputDate(refreshed?.meetingDate),
        changedSections,
        editorProgress: progress,
      });
    }

    if (action === "undo") {
      const reverted = await undoLastEditorChange(params.id, actorEmail);
      const result = await generateDraft(params.id, { skipAi: true });
      const content = result.deck.contentJson
        ? JSON.parse(result.deck.contentJson) as SlideContent
        : null;
      const refreshed = await getQbrFull(params.id);
      const deck = { fileName: result.fileName, fileUrl: result.fileUrl, versionNumber: result.deck.versionNumber };
      return NextResponse.json({
        ok: true,
        changed: true,
        proposalStatus: "reverted",
        changeSetId: reverted.id,
        applied: [uiLocale === "fr" ? "Dernière modification annulée" : "Undid the last agent change"],
        content,
        deck,
        options: readDeckOptions(refreshed?.deckOptionsJson),
        meetingDate: isoInputDate(refreshed?.meetingDate),
        changedSections: GUIDED_SECTIONS,
        editorProgress: progress,
      });
    }

    if (message) {
      await saveEditorMessage({
        qbrCycleId: params.id,
        role: "user",
        text: message,
        actorEmail,
        actorName,
        section: threadSection,
      });
    }

    if (operations?.length || patches?.length) {
      const appliedOps = operations?.length ? await applySlideEdits(params.id, operations) : [];
      const patchResult = patches?.length ? await applyDeckPatches(params.id, patches) : { changes: [], affectedSections: [] };
      const applied = [...appliedOps, ...patchResult.changes];
      const changed = applied.length > 0;
      let deck: { fileName: string; fileUrl: string; versionNumber: number } | null = null;
      let content: SlideContent | null = null;
      let options: Record<string, unknown> = {};
      let responseMeetingDate = isoInputDate(full.meetingDate);

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
        responseMeetingDate = isoInputDate(refreshed?.meetingDate);
      } else {
        options = readDeckOptions(full.deckOptionsJson);
      }

      const changedSections = [
        ...changedSectionsForOps((operations ?? []).map((o) => o.type)),
        ...changedSectionsForPatches(patches ?? []),
      ];
      const reply = changed
        ? applied.join("\n")
        : uiLocale === "fr"
          ? "Aucune modification appliquee."
          : "No changes applied.";

      const msgSection = primarySectionForOps(
        (operations ?? []).map((o) => o.type),
        threadSection,
        patches?.map((patch) => patch.target),
      );
      const assistantMsg =
        changed || operations?.length || patches?.length
          ? await saveEditorMessage({
              qbrCycleId: params.id,
              role: "assistant",
              text: reply,
              section: msgSection,
              metadata: { applied, deck, suggestions: [] },
            })
          : null;

      return NextResponse.json({
        ok: true,
        reply,
        applied,
        deck,
        content,
        options,
        meetingDate: responseMeetingDate,
        changedSections,
        suggestions: [],
        changed,
        aiEnabled: hasOpenAi(),
        editorProgress: progress,
        messageId: assistantMsg?.id ?? null,
      });
    }

    const isConfirm =
      confirmSection || (progress.guidedMode && CONFIRM_PATTERNS.test(message.trim()));

    if (isConfirm && progress.guidedMode) {
      const section = (confirmSection ?? progress.currentSection) as GuidedSection;
      const latest = full.deckVersions[full.deckVersions.length - 1];
      let latestContent: SlideContent | null = null;
      if (latest?.contentJson) {
        try {
          latestContent = JSON.parse(latest.contentJson) as SlideContent;
        } catch {
          latestContent = null;
        }
      }
      const review = getSectionReview(section, latestContent, progress, uiLocale);
      if (review.status === "needs_input") {
        return NextResponse.json({
          error: uiLocale === "fr"
            ? "Complétez les champs requis avant de confirmer cette diapositive."
            : "Complete the required fields before confirming this slide.",
          review,
        }, { status: 422 });
      }
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
        section: nextSection,
        metadata: { guided: true, section, nextSection },
      });

      return NextResponse.json({
        ok: true,
        reply,
        applied: [],
        deck: null,
        content: null,
        options: readDeckOptions(full.deckOptionsJson),
        meetingDate: isoInputDate(full.meetingDate),
        changedSections: [section],
        suggestions: allDone ? [] : [strings.editor.confirm],
        changed: false,
        aiEnabled: hasOpenAi(),
        editorProgress: updated,
        messageId: assistantMsg.id,
      });
    }

    const edit = await editSlides({
      message,
      context: buildEditorContext(full, { activeSection: threadSection, inputSource, guidedTask: guidedTask ?? null, editorProgress: progress }),
      activeSection: threadSection,
      inputSource,
      guidedTask: guidedTask ?? null,
    });
    const hasProposedChanges = edit.operations.length > 0 || (edit.patches?.length ?? 0) > 0;
    const proposal: EditorProposal = {
      reply: edit.reply,
      section: primarySectionForOps(
        edit.operations.map((op) => op.type),
        threadSection,
        edit.patches?.map((patch) => patch.target),
      ),
      confidence: hasProposedChanges ? 0.8 : 0.35,
      explanation: hasProposedChanges
        ? uiLocale === "fr"
          ? "J'ai converti votre réponse en champs structurés. Vérifiez-les avant de les appliquer."
          : "I converted your answer into structured fields. Review them before applying."
        : "",
      clarificationQuestion: hasProposedChanges ? null : edit.reply,
      fieldChanges: fieldChangesForOps(edit.operations, full),
      operations: edit.operations,
      patches: edit.patches ?? [],
      regenerate: edit.regenerate,
      suggestions: edit.suggestions,
    };
    const safetyText = clientFacingText(edit.operations);
    const review = safetyText ? await reviewForClientSafety({ text: safetyText }) : null;
    const changeSet = hasProposedChanges
      ? await createEditorProposal({
          qbrCycleId: params.id,
          proposal,
          message,
          actorEmail,
          actorName,
          review,
        })
      : null;

    const assistantMsg = await saveEditorMessage({
      qbrCycleId: params.id,
      role: "assistant",
      text: proposal.reply,
      section: proposal.section,
      metadata: {
        applied: [],
        suggestions: edit.suggestions,
        changeSetId: changeSet?.id ?? null,
        proposalStatus: changeSet ? "proposed" : null,
        review,
      },
    });

    return NextResponse.json({
      ok: true,
      reply: proposal.reply,
      applied: [],
      deck: null,
      content: null,
      options: readDeckOptions(full.deckOptionsJson),
      meetingDate: isoInputDate(full.meetingDate),
      changedSections: [],
      suggestions: edit.suggestions,
      changed: false,
      proposal: changeSet
        ? {
            id: changeSet.id,
            status: changeSet.status,
            section: changeSet.section,
            confidence: changeSet.confidence,
            explanation: changeSet.explanation,
            fieldChanges: proposal.fieldChanges,
            operations: proposal.operations,
            patches: proposal.patches,
            review,
            createdAt: changeSet.createdAt,
          }
        : null,
      aiEnabled: hasOpenAi(),
      editorProgress: progress,
      messageId: assistantMsg.id,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    const message = (err as Error).message;
    const status = /stale because the deck changed/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
