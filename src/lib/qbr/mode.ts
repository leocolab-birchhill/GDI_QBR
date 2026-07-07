/**
 * Dual-mode intent routing.
 *
 * After an email is classified into an intent, we route it into one of two modes:
 *
 *  - "workflow": the email supplies QBR content / requests an action
 *    (updates, approvals, revisions, metrics, commitments, priorities, upcoming
 *    items, draft/finalize). We capture data and confirm what changed.
 *
 *  - "agent": the email asks a question and wants information back
 *    (e.g. "What else do you need?", "Summarize the deck", "What changed?").
 *    We answer conversationally from QBR context WITHOUT forcing a "Captured"
 *    reply.
 *
 * Kept as pure functions so routing is deterministic and unit-testable.
 */

import { EmailIntent } from "../constants";

export type EmailWorkMode = "workflow" | "agent";

/**
 * Action intents that always run their workflow handler even when phrased as a
 * question ("Generate draft?"). These have side effects, so we honor the action.
 */
const ACTION_INTENTS = new Set<EmailIntent>([
  "CREATE_QBR",
  "REQUEST_DRAFT",
  "APPROVE_DRAFT",
  "REVISE_DRAFT",
  "FINALIZE_DRAFT",
  "SEND_SURVEY",
]);

/** Intents that are inherently informational (the user wants an answer). */
const QUESTION_INTENTS = new Set<EmailIntent>(["GENERAL_QUESTION", "UNKNOWN"]);

/** Phrases that strongly signal the user is asking a question, not submitting data. */
const QUESTION_PATTERNS: RegExp[] = [
  /what (else )?(do|does|are) (you|we|i)\b/i,
  /what'?s (missing|outstanding|left|next|the status|changed)/i,
  /what (is|are) (missing|outstanding|the open|the risks?)/i,
  /what changed( since)?/i,
  /can you (summarize|summarise|tell me|explain|give me|generate|draft)/i,
  /could you (summarize|summarise|explain|give me)/i,
  /who (owns|is responsible|is handling)/i,
  /where (are we|do (we|things) stand)/i,
  /why (are|is|do|did) (you|this|we|i)\b/i,
  /how('?s| is) (it|this|things) (going|looking)/i,
  /do you (still )?need/i,
  /^\s*(what|why|who|when|where|how|can|could|should|do|does|is|are)\b.*\?/im,
];

/** Heuristic: does this text read like a question? */
export function looksLikeQuestion(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (QUESTION_PATTERNS.some((re) => re.test(t))) return true;
  // A short message that ends in "?" with no structured key:value content.
  if (/\?\s*$/.test(t) && !/[:\-]\s*\S/.test(t)) return true;
  return false;
}

/**
 * Decide whether to answer (agent) or capture/act (workflow).
 *
 * Rules:
 *  - Action intents → always workflow (they have side effects).
 *  - Pure question intents (GENERAL_QUESTION/UNKNOWN) → agent.
 *  - Content intents (UPDATE, ADD_x, ANSWER_MISSING_INFO) → agent only when the
 *    text is clearly a question and carries no structured submission.
 */
export function determineMode(
  intent: EmailIntent,
  input: { subject?: string | null; body?: string | null },
): EmailWorkMode {
  if (ACTION_INTENTS.has(intent)) return "workflow";
  if (QUESTION_INTENTS.has(intent)) return "agent";

  const text = `${input.subject ?? ""}\n${input.body ?? ""}`;
  if (looksLikeQuestion(text)) return "agent";
  return "workflow";
}
