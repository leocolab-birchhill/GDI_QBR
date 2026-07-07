/**
 * Deterministic detection of the "hard action" an email is requesting.
 *
 * Used as the backstop for the LLM agent (and the sole signal when no OpenAI key
 * is configured). The goal: a deck is ALWAYS generated when the user asks for
 * one, regardless of phrasing ("generate a deck", "build the deck", "make the
 * slides", "put together a presentation", "generate draft", …).
 */

import { QbrAgentResult } from "../ai/schemas";

export type QbrAction = QbrAgentResult["action"];

const DECK_NOUN = /\b(deck|draft|powerpoint|power\s?point|pptx?|slides?|presentation)\b/i;
// Deliberately excludes generic verbs like "do"/"need" so questions such as
// "what do you need for the deck?" are NOT treated as a generate request.
const GENERATE_VERB = /\b(generate|create|build|rebuild|make|produce|prepare|put\s+together|assemble|whip\s+up|spin\s+up)\b/i;
// Verbs that mean "give me the file I already have" (no rebuild implied).
const SEND_VERB = /\b(send|share|email|attach|forward|resend|re-?send|give|get|grab|pull|download|provide)\b/i;

/**
 * Classify the action a message is asking for. Order matters: finalize/approve/
 * revise take precedence over draft generation.
 */
export function detectAction(text: string): QbrAction {
  const s = (text ?? "").toLowerCase();

  if (/\bfinalize\b|\bfinalise\b|final deck|produce the final/.test(s)) return "finalize";
  if (/\brevise\b|\brevision\b|soften|do not mention|don'?t mention|reword|change the|edit the/.test(s))
    return "revise";
  if (/\bapprove(d)?\b|sign(ed)? off|looks good,? (send|ship|go)/.test(s)) return "approve";
  if (/\b(survey|feedback|csat|nps)\b/.test(s)) return "send_survey";

  // Deck/draft generation — generous matching so "generate a deck", "build the
  // deck", "make the slides", "draft deck", etc. all trigger generation.
  if (
    /generate (the |a |this )?(draft|deck)/.test(s) ||
    /(draft|build|create|make|produce|prepare|assemble) (the |a |this )?deck/.test(s) ||
    (DECK_NOUN.test(s) && GENERATE_VERB.test(s))
  ) {
    return "generate_draft";
  }

  // "Send/share/email me the ppt/deck" — the user just wants the current file,
  // not a rebuild. Also covers "where is the deck" / "can I get the slides".
  if (
    (DECK_NOUN.test(s) && SEND_VERB.test(s)) ||
    /\bwhere('?s| is| are)\b[^?]*\b(deck|ppt|pptx|powerpoint|slides?|presentation)\b/.test(s)
  ) {
    return "send_deck";
  }

  return "none";
}
