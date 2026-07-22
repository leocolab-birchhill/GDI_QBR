import { notFound } from "next/navigation";
import { getQbrFull, readDeckOptions } from "@/lib/qbr/service";
import { loadEditorMessages, saveEditorMessage } from "@/lib/qbr/createWorkflow";
import { hasOpenAi } from "@/lib/env";
import type { SlideContent } from "@/lib/ai/schemas";
import type { DeckOptions } from "@/lib/ppt/generateQbrDeck";
import {
  getGuidedPrompt,
  getStrings,
  readEditorProgress,
  resolveQbrLocale,
} from "@/lib/i18n";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import { requireQbrAccessPage } from "@/lib/auth";
import CollaborateChat from "./CollaborateChat";

export const dynamic = "force-dynamic";

export default async function CollaboratePage({ params }: { params: { id: string } }) {
  await requireQbrAccessPage(params.id);
  const qbr = await getQbrFull(params.id);
  if (!qbr) notFound();

  const latest = qbr.deckVersions.length ? qbr.deckVersions[qbr.deckVersions.length - 1] : null;
  const uiLocale = getServerUiLocale();
  const deckLocale = resolveQbrLocale(qbr);
  const strings = getStrings(uiLocale);
  const progress = readEditorProgress(qbr.editorProgressJson);

  let initialContent: SlideContent | null = null;
  if (latest?.contentJson) {
    try {
      initialContent = JSON.parse(latest.contentJson) as SlideContent;
    } catch {
      initialContent = null;
    }
  }
  const initialOptions: DeckOptions = readDeckOptions(qbr.deckOptionsJson);
  // The account profile is the source of truth for the co-branding client logo,
  // so the live preview reflects it even if it was uploaded after deck creation.
  initialOptions.clientLogoUrl = qbr.account.logoUrl ?? initialOptions.clientLogoUrl ?? null;

  let dbMessages = await loadEditorMessages(qbr.id);
  if (dbMessages.length === 0) {
    const welcomeText = progress.guidedMode
      ? `${strings.editor.welcome}\n\n${getGuidedPrompt(progress.currentSection, uiLocale)}`
      : strings.editor.welcome;
    await saveEditorMessage({
      qbrCycleId: qbr.id,
      role: "assistant",
      text: welcomeText,
      section: progress.guidedMode ? progress.currentSection : undefined,
      metadata: {
        welcome: true,
        deck: latest?.fileUrl ? { fileUrl: latest.fileUrl, versionNumber: latest.versionNumber } : null,
      },
    });
    dbMessages = await loadEditorMessages(qbr.id);
  }

  const initialMessages = dbMessages.map((m) => {
    let meta: Record<string, unknown> = {};
    if (m.metadataJson) {
      try {
        meta = JSON.parse(m.metadataJson);
      } catch {
        /* ignore */
      }
    }
    return {
      id: m.id,
      role: m.role as "user" | "assistant",
      text: m.text,
      section: m.section ?? undefined,
      actorName: m.actorName ?? undefined,
      applied: meta.applied as string[] | undefined,
      deck: meta.deck as { fileUrl: string; versionNumber: number } | undefined,
      suggestions: meta.suggestions as string[] | undefined,
    };
  });

  return (
    <CollaborateChat
      qbrId={qbr.id}
      initialClientName={qbr.account.clientName}
      initialMeetingDate={qbr.meetingDate ? qbr.meetingDate.toISOString().slice(0, 10) : ""}
      quarterYear={`${qbr.quarter} ${qbr.year}`}
      status={qbr.status}
      aiEnabled={hasOpenAi()}
      initialDeck={
        latest && latest.fileUrl
          ? { fileUrl: latest.fileUrl, versionNumber: latest.versionNumber }
          : null
      }
      initialContent={initialContent}
      initialOptions={initialOptions}
      initialUiLocale={uiLocale}
      initialDeckLocale={deckLocale}
      initialProgress={progress}
      initialMessages={initialMessages}
    />
  );
}
