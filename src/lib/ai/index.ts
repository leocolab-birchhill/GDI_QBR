import { z } from "zod";
import { completeJson } from "./openaiClient";
import { hasOpenAi } from "../env";
import { TO_CONFIRM, type Locale } from "../constants";
import {
  ClientSafeResult,
  ClientSafeSchema,
  ExtractionResult,
  ExtractionSchema,
  IntentResult,
  IntentSchema,
  LanguageSchema,
  MissingInfoQuestions,
  MissingInfoQuestionsSchema,
  QbrAgentResult,
  QbrAgentSchema,
  QbrAnswerResult,
  QbrAnswerSchema,
  SlideEditResult,
  SlideEditSchema,
  ReviewResult,
  ReviewSchema,
  SlideContent,
  SlideContentSchema,
  VpSummaryResult,
  VpSummarySchema,
} from "./schemas";
import { AnswerContext, deterministicAnswer } from "../qbr/answer";
import { detectAction } from "../qbr/action";
import { parseSlideEditFallback } from "../qbr/slideEditFallback";
import type { EditorContext } from "../qbr/editorContext";
import {
  fallbackClassify,
  fallbackExtract,
  fallbackMissingInfoQuestions,
  fallbackRewrite,
  fallbackReview,
} from "./fallbacks";
import { getTemplateReference } from "../ppt/templateExtract";

/**
 * Validate model JSON against a schema with one retry. If validation keeps
 * failing (or no key configured) the caller's deterministic fallback is used.
 */
async function callAndValidate<S extends z.ZodTypeAny>(
  schema: S,
  system: string,
  user: string,
  opts?: { reasoningEffort?: "minimal" | "low" | "medium" | "high" },
): Promise<z.infer<S> | null> {
  if (!hasOpenAi()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await completeJson({ system, user, reasoningEffort: opts?.reasoningEffort });
    if (!raw) continue;
    try {
      const json = JSON.parse(raw);
      const parsed = schema.safeParse(json);
      if (parsed.success) return parsed.data;
      console.warn("[ai] schema validation failed (attempt %d):", attempt + 1, parsed.error.issues);
    } catch (err) {
      console.warn("[ai] JSON parse failed (attempt %d):", attempt + 1, (err as Error).message);
    }
  }
  return null;
}

const INTENT_VALUES = IntentSchema.shape.intent.options.join(", ");

/**
 * Fast, dedicated language identification for an inbound email. Uses a tiny,
 * minimal-reasoning model call so it is cheap and quick. Returns the detected
 * locale, or null when no OpenAI key is configured / the call fails (the caller
 * then falls back to the deterministic word-based detector).
 *
 * IMPORTANT: pass only the sender's latest message (quoted history stripped) so
 * a reply in an English thread isn't misread as French because of the quoted
 * French history beneath it.
 */
export async function detectEmailLanguageAI(input: {
  subject: string;
  body: string;
}): Promise<Locale | null> {
  if (!hasOpenAi()) return null;
  const system = `You identify the language a person wrote their email in. Only two options: English ("en") or French ("fr"). Judge ONLY by the words the sender actually wrote in the subject and body. If the text is too short or ambiguous, pick the more likely of the two. Respond ONLY with JSON: {"language":"en"} or {"language":"fr"}.`;
  const user = `Subject: ${input.subject}\n\nBody:\n${input.body}`;
  const result = await callAndValidate(LanguageSchema, system, user, { reasoningEffort: "minimal" });
  return result?.language ?? null;
}

export async function classifyEmailIntent(input: {
  subject: string;
  body: string;
}): Promise<IntentResult> {
  const system = `You classify inbound Quarterly Business Review (QBR) emails from internal operations staff. Respond ONLY with JSON: {"intent": one of [${INTENT_VALUES}], "confidence": 0..1, "reasoning": string}. Pick the single best intent.

Intent guide:
- CREATE_QBR: start/create a new QBR OR onboard a brand-new client/account (often "Start QBR - Client - Q# YYYY", but ALSO "create a new account", "create new account", "set up a new client", "onboard <Client>", "add a new client/account", "nouveau compte", "créer un compte/client"). Treat any request to create an account, client, or QBR as CREATE_QBR — there is no separate account-creation intent.
- UPDATE_QBR: a general progress update / monthly check-in notes about the account.
- ADD_COMMITMENT / ADD_PRIORITY / ADD_METRIC / ADD_UPCOMING_ITEM: the email mainly supplies that one type of content (a follow-up action, a priority item, a dashboard metric, or a What's-Next item).
- ANSWER_MISSING_INFO: replying with answers to previously requested missing info.
- REQUEST_DRAFT: asks to generate/build/create the draft deck or PowerPoint.
- APPROVE_DRAFT: approves the current draft. REVISE_DRAFT: asks for edits/changes. FINALIZE_DRAFT: asks to finalize/produce the final deck.
- SEND_SURVEY: asks to send feedback/surveys.
- GENERAL_QUESTION: asks a question or requests a STATUS UPDATE / "what do you still need" / "where are we" / help — i.e. wants information back, not submitting new content.
- UNKNOWN: none of the above.`;
  const user = `Subject: ${input.subject}\n\nBody:\n${input.body}`;
  const result = await callAndValidate(IntentSchema, system, user);
  return result ?? fallbackClassify(input);
}

export async function extractQbrDataFromEmail(input: {
  subject: string;
  body: string;
  knownClient?: string;
}): Promise<ExtractionResult> {
  const system = `You extract structured QBR data from operator emails. Respond ONLY with JSON matching this shape:
{intent, clientName, quarter, year, meetingDate, nextMeetingDate, vpOwner, director, commitments:[{action,status,owner,dueDate,rawInput}], priorityItems:[{title,rawInput,category,needsDecision,timing}], metrics:[{group,label,value,isConfirmed}], upcomingItems:[{title,rawInput,timing}], missingInfoAnswers:[{field,answer}], approvalAction:"approve"|"revise"|"finalize"|"none", revisionRequest, confidence, needsHumanReview}.
Rules: Never invent metric values. If a value is unknown, set value to "${TO_CONFIRM}" and isConfirmed=false. Preserve original rough text in rawInput. quarter must look like "Q1".
clientName: extract the client/account name even from creation requests — e.g. 'create a new account called "Client 1"', "set up a new client named Acme", "new account for University of Montreal" → clientName = "Client 1" / "Acme" / "University of Montreal". Strip surrounding quotes. If no name is given, leave it null.
Dates: "meetingDate" is THIS QBR's meeting date; "nextMeetingDate" is the proposed date of the NEXT QBR/meeting (e.g. "next review July 16", "let's meet again on..."). Use ISO yyyy-mm-dd when a concrete date is given; otherwise leave null. Never guess a date that was not stated.`;
  const user = `Subject: ${input.subject}\n\nBody:\n${input.body}${input.knownClient ? `\n\nKnown client: ${input.knownClient}` : ""}`;
  const result = await callAndValidate(ExtractionSchema, system, user);
  return result ?? fallbackExtract(input);
}

export async function rewriteClientSafe(input: {
  rawText: string;
  context?: string;
}): Promise<ClientSafeResult> {
  const system = `You rewrite rough internal operator notes into professional, client-facing language for a Quarterly Business Review.
Rules: remove blame, politics, and sensitive internal comments; preserve meaning; do not invent facts; mark unknowns as "${TO_CONFIRM}".
Respond ONLY with JSON: {"clientReadyText": string, "removedSensitiveContent": boolean}.`;
  const user = `${input.context ? `Context: ${input.context}\n\n` : ""}Raw note:\n${input.rawText}`;
  const result = await callAndValidate(ClientSafeSchema, system, user);
  return result ?? fallbackRewrite(input.rawText);
}

export async function generateMissingInfoQuestions(input: {
  clientName: string;
  knownFields: string[];
  context?: string;
}): Promise<MissingInfoQuestions> {
  const system = `You generate a short checklist of missing-info questions for a QBR. Respond ONLY with JSON: {"questions":[{"field":string,"question":string}]}. Ask only for what is missing. Be concise.`;
  const user = `Client: ${input.clientName}\nAlready known fields: ${input.knownFields.join(", ") || "none"}\n${input.context ?? ""}`;
  const result = await callAndValidate(MissingInfoQuestionsSchema, system, user);
  return result ?? fallbackMissingInfoQuestions(input.knownFields);
}

export async function generateSlideContent(input: {
  data: unknown;
}): Promise<SlideContent | null> {
  // Inject the real approved deck (extracted from the actual .pptx) so generated
  // content mirrors the house format exactly.
  const reference = await getTemplateReference();
  const system = `You produce slide-ready content for a 7-slide QBR deck that must match our approved house template in structure and tone. Respond ONLY with JSON matching the provided structure. Keep priority explanations to 1-2 sentences and What's Next details to one concise sentence. Never invent metric values; keep "${TO_CONFIRM}" where unconfirmed. Match the exact structure, slide order, section names, table columns, item counts, and level of detail of the reference template below. Use the reference ONLY for format — never copy its specific facts, numbers, names, or dates.

${reference}`;
  const user = `Structured QBR data:\n${JSON.stringify(input.data, null, 2)}`;
  return callAndValidate(SlideContentSchema, system, user);
}

export async function reviewForClientSafety(input: { text: string }): Promise<ReviewResult> {
  const system = `You review text for client-safety in a QBR deck. Flag blame, internal politics, sensitive comments, or invented facts. Respond ONLY with JSON: {"isClientSafe": boolean, "issues": string[], "suggestedRewrite": string|null}.`;
  const user = input.text;
  const result = await callAndValidate(ReviewSchema, system, user);
  return result ?? fallbackReview(input.text);
}

export async function summarizeQbrForVp(input: {
  clientName: string;
  quarter: string;
  data: unknown;
}): Promise<VpSummaryResult> {
  const system = `You write a one-month QBR preparation summary for a VP. Respond ONLY with JSON: {"summary": string, "missingFields": string[], "itemsNeedingVpReview": string[]}. The summary should cover: current status, open follow-ups, draft priority items, available metrics, missing metrics, what's next, items needing VP review.`;
  const user = `Client: ${input.clientName} ${input.quarter}\nData:\n${JSON.stringify(input.data, null, 2)}`;
  const result = await callAndValidate(VpSummarySchema, system, user);
  return (
    result ?? {
      summary: buildDeterministicVpSummary(input),
      missingFields: [],
      itemsNeedingVpReview: [],
    }
  );
}

/**
 * Agent answer mode: answer a free-form QBR question conversationally and
 * specifically, grounded in the QBR context loaded from the DB. Falls back to a
 * deterministic answer when no OpenAI key is configured.
 */
export async function answerQbrQuestion(input: {
  question: string;
  context: AnswerContext;
}): Promise<QbrAnswerResult> {
  const system = `You are the GDI QBR assistant answering an internal operator's question about a specific Quarterly Business Review. Answer conversationally, specifically, and concisely using ONLY the provided QBR context — never invent metric values, owners, or dates.
The context includes: meetingDate (this quarter's meeting), nextMeetingDate (the next QBR), previousQbrNotes, and latestDeck (a summary of the most recent generated deck — the "last presentation"). USE these to answer date questions ("when is the next meeting?") and recall questions ("what did we present last time?"). If a date or fact is null/absent, say it isn't on file yet rather than guessing.
Answer EVERY part of a multi-part question. If the question implies an action (e.g. "generate the draft", "what do you need"), say what you'll do or what you need. Do NOT force a "Captured" format; this is an answer, not a data capture. Respond ONLY with JSON: {"answer": string, "nextActions": string[]}. Keep nextActions short and actionable.`;
  const user = `Question:\n${input.question}\n\nQBR context (JSON):\n${JSON.stringify(input.context, null, 2)}`;
  const result = await callAndValidate(QbrAnswerSchema, system, user);
  return result ?? deterministicAnswer(input.question, input.context);
}

/**
 * Email agent: treat every inbound email as a turn in a conversation with the
 * GDI QBR assistant, grounded in the full QBR context. The agent ALWAYS answers
 * conversationally AND flags any hard action the app must perform (generate the
 * deck, approve, revise, finalize, send survey). The orchestrator executes the
 * flagged action (e.g. actually generating + attaching the .pptx).
 *
 * Falls back to deterministic answer + keyword-based action detection when no
 * OpenAI key is configured, so deck-on-request still works offline.
 */
export async function runQbrAgent(input: {
  message: string;
  context: AnswerContext;
  /** Human-readable list of what was just captured from this email (if any). */
  capturedChanges?: string[];
  /** Language the reply MUST be written in (detected from the inbound email). */
  locale?: "fr" | "en";
}): Promise<QbrAgentResult> {
  const actionsList = "generate_draft, send_deck, approve, revise, finalize, send_survey, none";
  const languageRule =
    input.locale === "en"
      ? `LANGUAGE (STRICT): Reply in ENGLISH ONLY. Write "reply" and every "nextActions" item entirely in English, even though the QBR context/data below may be in French. Do not switch to French.`
      : `LANGUE (STRICT) : Répondez UNIQUEMENT en français (fr-CA), dans un ton professionnel. Rédigez « reply » et chaque élément de « nextActions » entièrement en français, même si le contexte/les données du QBR ci-dessous sont en anglais. Ne passez pas à l'anglais.`;
  const system = `You are the GDI QBR assistant. You converse with an internal operator over email and have the FULL context of one QBR (account, quarter, meetingDate, nextMeetingDate, previousQbrNotes, commitments, priorities, metrics, upcoming items, missing info, approvals, deck versions, latestDeck content summary, recent emails). Behave like a helpful chatbot that also takes real actions and remembers prior meetings.

${languageRule}

Rules:
- Answer the user's message directly, specifically, and conversationally using ONLY the provided context. Never invent metric values, owners, or dates.
- Answer EVERY part of a multi-part email. If they ask several things (e.g. "where are we? + when's the next meeting? + send the deck"), address each one.
- Use meetingDate / nextMeetingDate to answer "when is the meeting / next QBR?" and latestDeck + previousQbrNotes to answer "what did we present / discuss last time?". If a value is null/absent, say it's not on file yet — do not guess.
- If the user asks a question (e.g. "what do you still need?", "summarize the deck", "what changed?"), answer it — do NOT force a "Captured" format.
- Decide whether a HARD ACTION is required and set "action" to one of: ${actionsList}.
  • generate_draft → user wants the deck/draft/slides/presentation generated, built, or rebuilt from scratch with the latest data.
  • send_deck → user just wants to RECEIVE the current deck file (e.g. "send the ppt", "share the deck", "email me the slides", "where's the powerpoint?"). Attaches the existing deck without rebuilding.
  • approve → user approves the current draft.
  • revise → user asks for edits/changes (put the instructions in revisionNote).
  • finalize → user wants the final deck produced.
  • send_survey → user wants feedback/surveys sent.
  • none → no hard action; just a conversational answer or data capture.
- Items the system already captured from THIS email are listed under "Just captured"; acknowledge them briefly but do not re-list everything.
- Keep "nextActions" short and actionable.
Respond ONLY with JSON: {"reply": string, "action": one of [${actionsList}], "revisionNote": string|null, "nextActions": string[]}.`;

  const user = `User email:\n${input.message}\n\nJust captured (already stored this turn):\n${
    input.capturedChanges?.length ? input.capturedChanges.map((c) => `- ${c}`).join("\n") : "(nothing new)"
  }\n\nQBR context (JSON):\n${JSON.stringify(input.context, null, 2)}`;

  const result = await callAndValidate(QbrAgentSchema, system, user);
  if (result) {
    // Safety net: if the LLM missed an obvious deck/approve/finalize request,
    // honor the deterministic signal so the action is never silently dropped.
    if (result.action === "none") {
      const detected = detectAction(input.message);
      if (detected !== "none") result.action = detected;
    }
    return result;
  }

  // Deterministic fallback (no OpenAI key / validation failure).
  const fallbackAnswer = deterministicAnswer(input.message, input.context);
  return {
    reply: fallbackAnswer.answer,
    action: detectAction(input.message),
    revisionNote: null,
    nextActions: fallbackAnswer.nextActions,
  };
}

/**
 * Slide-editor agent: powers the in-app collaboration chat. Given the user's
 * instruction and the full QBR context, it returns a conversational reply plus
 * structured edit operations to apply to the deck data, then the caller
 * regenerates the .pptx. Falls back to a no-op (asks the user to be specific)
 * when no OpenAI key is configured, so the chat still produces a fresh deck.
 */
export async function editSlides(input: {
  message: string;
  context: EditorContext;
  activeSection?: string | null;
}): Promise<SlideEditResult> {
  const ops =
    "set_metric{group,label,value}, remove_metric{label}, add_priority{title,explanation}, reword_priority{title,explanation}, remove_priority{title}, add_upcoming{title,detail}, remove_upcoming{title}, add_commitment{action,owner,status}, set_commitment_status{action,status,owner}, remove_commitment{action}, set_meeting_date{date}, set_next_meeting_date{date}";
  const patchTargets =
    "deckLayout.customSlides, deckLayout.hiddenSections, deckLayout.sectionOrder, deckLayout.hiddenDashboardGroups, deckLayout.extraDashboardGroups, deckOptions";
  const activeCtx = input.activeSection
    ? `\nThe user is currently viewing the "${input.activeSection}" slide. Resolve ambiguous requests ("this slide", "make it shorter", "add one more") against that slide first.`
    : "";
  const system = `You are the GDI QBR slide editor — a capable PowerPoint editing assistant. The user is collaborating with you in a chat to revise their QBR deck. The deck is regenerated from structured data PLUS deck layout metadata and presentation options.${activeCtx}

You have TWO ways to apply edits — use BOTH when appropriate:

1) **operations** — for content rows (metrics, priorities, follow-ups, what's-next, meeting dates, client name, agenda).
   Available: ${ops}

2) **patches** — for deck structure and slide FORMAT metadata. Prefer patches over operations for:
   - Custom slide add/edit/remove/move/format changes
   - Converting a custom slide between list (prose) and table
   - Hiding/showing built-in sections, reordering sections
   - Dashboard group visibility
   - Deck-wide presentation (page numbers, footer, title tag)
   Patch targets: ${patchTargets}

PATCH FORMAT (each item in "patches" array):
- deckLayout.customSlides + action "add": set { title, kind:"prose"|"table", body, afterSection }
  • prose body: one bullet per line ("Title: detail" or plain line)
  • table body: first line = headers separated by "|", following lines = data rows
- deckLayout.customSlides + action "update" + match { id or title }: set { title?, kind?, body?, afterSection? }
  • To convert list → table: set kind "table" AND rewrite body as pipe-separated rows (derive columns from the list content)
  • To convert table → list: set kind "prose" AND rewrite body as one line per row
- deckLayout.customSlides + action "remove" + match { id or title }
- deckLayout.hiddenSections + action "add"|"remove": set { section } — add hides, remove restores
- deckLayout.sectionOrder + action "set": set { value: ["agenda","priorities",...] }
- deckLayout.hiddenDashboardGroups / extraDashboardGroups + action "add"|"remove"|"set"
- deckOptions + action "set": set { pageNumbers, pageNumberPosition, footerText, titleTag, ... } (merged into deck options)

The context JSON includes **slides.customSlides** (current custom slides with id, title, kind, body), **deckLayout**, and **deckOptions** — patch these directly for format/structure edits.

CRITICAL — NEVER REFUSE. Map every request to operations and/or patches.
- Content changes (metric values, priority text) → operations
- Slide format, layout, visibility, custom slides → patches
- Page numbers / footer / title tag → deckOptions patch OR set_page_numbers/set_footer/set_title_tag operations (patches preferred)

Rules:
- Match existing items by label/title/action/id (case-insensitive).
- VERBATIM TEXT: copy user-supplied text EXACTLY into operation/patch fields.
- Do NOT invent metric VALUES the user didn't provide.
- Set "regenerate" true whenever you applied any edit (default true).
- In "reply", confirm what changed in plain language.
- In "suggestions", offer 2-3 concrete next edits.
Respond ONLY with JSON: {"reply": string, "operations": [...], "patches": [...], "regenerate": boolean, "suggestions": string[]}.`;
  const user = `User request:\n${input.message}\n\nCurrent QBR editor context (JSON):\n${JSON.stringify(input.context, null, 2)}`;

  const result = await callAndValidate(SlideEditSchema, system, user, { reasoningEffort: "low" });
  return result ?? parseSlideEditFallback(input.message, input.context);
}

/** Translate slide content prose to the target deck locale (fr-CA / en). */
export async function translateSlideContentToLocale(
  content: SlideContent,
  locale: "fr" | "en",
): Promise<SlideContent | null> {
  if (!hasOpenAi()) return null;
  const target = locale === "fr" ? "French (fr-CA)" : "English";
  const system = `You translate QBR slide content JSON for a client-facing PowerPoint deck into ${target}.
Rules:
- Translate ALL human-readable strings (follow-up actions, statuses, priority titles/explanations, dashboard labels, what's-next items).
- Preserve JSON shape exactly; do not add or remove items.
- Keep proper nouns, numbers, percentages, dates, and owner names unchanged.
- Status values: use Ouvert / En cours / Complété / À confirmer for French; Open / In Progress / Complete / To confirm for English.
- Metric labels should be natural ${target} business language.
Respond ONLY with valid JSON matching the SlideContent schema.`;
  const user = JSON.stringify(content);
  return callAndValidate(SlideContentSchema, system, user, { reasoningEffort: "low" });
}

function buildDeterministicVpSummary(input: { clientName: string; quarter: string; data: any }): string {
  const d = input.data ?? {};
  const lines: string[] = [];
  lines.push(`${input.clientName} ${input.quarter} QBR — preparation summary`);
  lines.push("");
  lines.push(`Status: ${d.status ?? "unknown"}`);
  lines.push("");
  lines.push("Open follow-ups:");
  for (const c of d.commitments ?? []) lines.push(`- ${c.action} [${c.status}] (${c.owner ?? "unassigned"})`);
  lines.push("");
  lines.push("Draft priority items:");
  for (const p of d.priorityItems ?? []) lines.push(`- ${p.title}`);
  lines.push("");
  lines.push("Metrics:");
  for (const m of d.dashboardMetrics ?? []) lines.push(`- ${m.group}: ${m.label} = ${m.value ?? TO_CONFIRM}`);
  lines.push("");
  lines.push("What's next:");
  for (const u of d.upcomingItems ?? []) lines.push(`- ${u.title}`);
  lines.push("");
  lines.push("Items needing VP review:");
  const missing = (d.missingInfoRequests ?? []).filter((r: any) => r.status === "Open");
  for (const r of missing) lines.push(`- ${r.field}: ${r.question}`);
  return lines.join("\n");
}
