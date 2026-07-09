/**
 * Deterministic slide-edit parser — the offline brain of the collaboration chat.
 *
 * Turns plain-English instructions into structured SlideEditOps so the deck can
 * be revised WITHOUT an LLM (the app currently runs on deterministic fallbacks
 * when no OpenAI key is set). Designed to cover the common deck edits people ask
 * for, especially dashboard metric changes.
 *
 * Pure function (no DB) → easy to unit test.
 */

import { SlideEditOp, SlideEditResult } from "../ai/schemas";
import { AnswerContext } from "./answer";

function inferGroup(label: string, hint?: string): string {
  const s = `${hint ?? ""} ${label}`.toLowerCase();
  if (/safety|health|injur|incident|hazard/.test(s)) return "Health & Safety";
  if (/financ|invoice|billing|cost|revenue|wage|budget|\$/.test(s)) return "Financial";
  return "Operational";
}

/** Pull "<label> <sep> <value>" where sep is '=', ':' or the word 'to'. */
function splitLabelValue(s: string): { label: string; value: string } | null {
  let m = s.match(/^(.*?)\s*=\s*(.+)$/);
  if (!m) m = s.match(/^(.*?)\s+to\s+(.+)$/i);
  if (!m) m = s.match(/^(.*?)\s*:\s*(.+)$/);
  if (!m) return null;
  const label = m[1].trim().replace(/^["']|["']$/g, "");
  const value = m[2].trim().replace(/^["']|["']$/g, "").replace(/[.;]+$/, "");
  if (!label || !value) return null;
  return { label, value };
}

/** Strip leading command words so we're left with the payload. */
function stripPrefix(s: string, re: RegExp): string {
  return s.replace(re, "").replace(/^[\s:>\-–—]+/, "").trim();
}

interface Parsed {
  op: SlideEditOp;
  describe: string;
}

function parseOne(raw: string): Parsed | null {
  const line = raw.trim();
  if (!line) return null;
  const lower = line.toLowerCase();

  // ── Add a custom slide ───────────────────────────────────────────────────────
  const addSlide = line.match(
    /^(?:please\s+)?(?:add|create|insert)\s+(?:a\s+)?(?:new\s+)?slide(?:\s+(?:called|titled|named))?\s*[:"']?\s*(.+?)\s*$/i,
  );
  if (addSlide) {
    const title = addSlide[1].trim().replace(/^["']|["']$/g, "");
    const kind = /\btable\b/i.test(lower) ? "table" : "prose";
    return {
      op: { type: "add_slide", title, kind, body: "", afterSection: "whatsNext" },
      describe: `Add a new slide "${title}"`,
    };
  }

  // ── Remove dashboard section/group ───────────────────────────────────────────
  const removeDash = line.match(
    /^(?:please\s+)?(?:remove|delete|hide)\s+(?:the\s+)?(?:(\w[\w\s&]+?)\s+)?(?:dashboard\s+)?(?:section|group|column)\s*$/i,
  );
  if (removeDash && /dashboard|financial|operational|safety|health/i.test(lower)) {
    const group = removeDash[1]?.trim() || (/\bfinanc/i.test(lower) ? "Financial" : /\boperat/i.test(lower) ? "Operational" : /\bsafety|health/i.test(lower) ? "Health & Safety" : "Financial");
    return { op: { type: "remove_dashboard_group", group }, describe: `Remove dashboard section "${group}"` };
  }
  if (/^(?:please\s+)?(?:remove|delete|hide)\s+(?:the\s+)?(financial|operational|health\s*&\s*safety)\s+(?:dashboard\s+)?(?:section|group)/i.test(lower)) {
    const m = lower.match(/(financial|operational|health\s*&\s*safety|health and safety)/i);
    const group = m ? m[1].replace(/health and safety/i, "Health & Safety").replace(/\b\w/g, (c) => c.toUpperCase()) : "Financial";
    return { op: { type: "remove_dashboard_group", group }, describe: `Remove dashboard section "${group}"` };
  }

  // ── Presentation-level format edits (handled first so "add page numbers" is not
  //    mistaken for a metric, and so the editor never refuses a format request) ──
  const fmt = parseFormat(line, lower);
  if (fmt) return fmt;

  // ── Remove ──────────────────────────────────────────────────────────────────
  const remove = line.match(/^(?:please\s+)?(?:remove|delete|drop)\s+(?:the\s+)?(.+?)\s*(metric|priority|follow[\s-]?up|commitment|action|upcoming|what'?s[\s-]?next(?:\s+item)?|item)?\s*$/i);
  if (/^(?:please\s+)?(?:remove|delete|drop)\b/i.test(lower) && remove) {
    const target = remove[1].trim().replace(/^the\s+/i, "").replace(/^["']|["']$/g, "");
    const kind = (remove[2] ?? "").toLowerCase();
    if (/priorit/.test(kind)) return { op: { type: "remove_priority", title: target }, describe: `Remove priority "${target}"` };
    if (/upcoming|next/.test(kind)) return { op: { type: "remove_upcoming", title: target }, describe: `Remove what's-next item "${target}"` };
    if (/follow|commit|action/.test(kind)) return { op: { type: "remove_commitment", action: target }, describe: `Remove follow-up "${target}"` };
    // default: treat as metric
    return { op: { type: "remove_metric", label: target }, describe: `Remove metric "${target}"` };
  }

  // ── Commitment status ("mark X as complete", "set X follow-up to in progress")
  const markStatus = line.match(/^(?:please\s+)?(?:mark|set)\s+(?:the\s+)?(.+?)\s+(?:follow[\s-]?up|commitment|action)?\s*(?:as|to)\s+(complete|completed|done|in[\s-]?progress|open|to\s?confirm)\s*$/i);
  if (markStatus) {
    const action = markStatus[1].trim().replace(/\s+(follow[\s-]?up|commitment|action)$/i, "");
    let status = markStatus[2].toLowerCase();
    status = /complete|done/.test(status) ? "Complete" : /progress/.test(status) ? "In Progress" : /open/.test(status) ? "Open" : "To confirm";
    return { op: { type: "set_commitment_status", action, status }, describe: `Set follow-up "${action}" → ${status}` };
  }

  // ── Reword priority ("reword the X priority to Y") ───────────────────────────
  const reword = line.match(/^(?:please\s+)?(?:reword|rewrite|rephrase|change)\s+(?:the\s+)?(.+?)\s+priority\s+(?:to|as|:)\s+(.+)$/i);
  if (reword) {
    return { op: { type: "reword_priority", title: reword[1].trim(), explanation: reword[2].trim() }, describe: `Reword priority "${reword[1].trim()}"` };
  }

  // ── Add priority ─────────────────────────────────────────────────────────────
  if (/\bpriorit/i.test(lower) && /\b(add|new|create|include)\b/i.test(lower)) {
    const payload = stripPrefix(line, /^(?:please\s+)?(?:add|create|include|new)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?priority(?:\s+item)?/i);
    const sv = splitLabelValue(payload);
    const title = (sv ? sv.label : payload) || payload;
    const explanation = sv ? sv.value : undefined;
    if (title) return { op: { type: "add_priority", title, explanation }, describe: `Add priority "${title}"` };
  }

  // ── Add what's-next / upcoming ───────────────────────────────────────────────
  if (/(what'?s[\s-]?next|upcoming)/i.test(lower) && /\b(add|new|create|include)\b/i.test(lower)) {
    const payload = stripPrefix(line, /^(?:please\s+)?(?:add|create|include|new)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:what'?s[\s-]?next|upcoming)(?:\s+item)?/i);
    const sv = splitLabelValue(payload);
    const title = (sv ? sv.label : payload) || payload;
    const detail = sv ? sv.value : undefined;
    if (title) return { op: { type: "add_upcoming", title, detail }, describe: `Add what's-next item "${title}"` };
  }

  // ── Meeting date ─────────────────────────────────────────────────────────────
  if (/(meeting date|next qbr date|qbr date|meet on|next meeting|next review|meet again)/i.test(lower)) {
    const sv = splitLabelValue(stripPrefix(line, /^(?:please\s+)?(?:set|update|change)?\s*(?:the\s+)?/i));
    const dateStr = sv?.value ?? line.replace(/.*\b(?:to|on|:)\s*/i, "").trim();
    if (dateStr) {
      const isNext = /(next (?:meeting|qbr|review|sync)|meet again|meet next|follow[\s-]?up meeting)/i.test(lower);
      return isNext
        ? { op: { type: "set_next_meeting_date", date: dateStr }, describe: `Set next meeting date → ${dateStr}` }
        : { op: { type: "set_meeting_date", date: dateStr }, describe: `Set meeting date → ${dateStr}` };
    }
  }

  // ── Dashboard metric (set/add/update X = Y | X to Y | X: Y) ──────────────────
  // This is the catch-all for "<label> = <value>" style instructions.
  {
    const payload = stripPrefix(
      line,
      /^(?:please\s+)?(?:add(?:\s+to)?(?:\s+the)?(?:\s+dashboard)?|set|update|change|put|record)\b\s*(?:the\s+)?(?:dashboard\s+)?(?:metric\s+)?(?:for\s+)?/i,
    );
    const sv = splitLabelValue(payload);
    if (sv) {
      const group = inferGroup(sv.label, lower);
      return {
        op: { type: "set_metric", group, label: sv.label, value: sv.value },
        describe: `Set ${group} metric "${sv.label}" → ${sv.value}`,
      };
    }
  }

  return null;
}

/**
 * Parse presentation-level (deck-wide) format requests: page numbers, footers,
 * and "add <text> to every slide / the title section / as a badge". Returns null
 * when the line isn't a recognizable format request.
 */
function parseFormat(line: string, lower: string): Parsed | null {
  const isOff = /\b(remove|delete|hide|turn off|no)\b/.test(lower);

  // Page / slide numbers.
  if (/\b(page|slide)\s*(number|numbering|no\.?|#)/.test(lower) || /\bnumber the (pages|slides)\b/.test(lower)) {
    if (isOff) return { op: { type: "set_page_numbers", value: "off" }, describe: "Turn off page numbers" };
    const both = /\bboth\b|top and bottom|left and right|all corners/.test(lower);
    const left = /\bleft\b/.test(lower);
    const value = both ? "bottom-both" : left ? "bottom-left" : "bottom-right";
    return { op: { type: "set_page_numbers", value }, describe: `Add page numbers (${value})` };
  }

  // Footer / disclaimer / confidentiality line.
  if (/\b(footer|disclaimer|confidential|copyright|©)\b/.test(lower)) {
    if (isOff) return { op: { type: "set_footer", value: "" }, describe: "Remove the footer" };
    const text = afterColonOrTo(line) || (/confidential/i.test(lower) ? "Confidential" : line);
    return { op: { type: "set_footer", value: text }, describe: `Set footer → "${text}"` };
  }

  // "Add <text/number> to every slide / each slide / the title section / a badge / watermark / label".
  const everySlide = /(every|each|all)\s+slides?|title section|header|badge|watermark|\blabel\b|\btag\b/.test(lower);
  if (everySlide && /\b(add|put|place|include|show|stamp)\b/.test(lower)) {
    const tag = extractTagText(line);
    if (tag) return { op: { type: "set_title_tag", value: tag }, describe: `Add "${tag}" to every slide` };
  }

  return null;
}

/** Pull the text after a ':' or the word 'to' (used for footer / tag payloads). */
function afterColonOrTo(line: string): string | null {
  const m = line.match(/(?::|(?:\bto\b)|(?:\bsay(?:ing)?\b)|(?:\bwith\b)|(?:\bthat reads\b))\s+(.+)$/i);
  return m ? m[1].trim().replace(/^["']|["']$/g, "").replace(/[.;]+$/, "") : null;
}

/**
 * Extract the literal text/number a user wants stamped on every slide, e.g.
 * "add the number 67 to each slide" → "67"; 'add "Draft" to every slide' → Draft.
 */
function extractTagText(line: string): string | null {
  const quoted = line.match(/["']([^"']+)["']/);
  if (quoted) return quoted[1].trim();
  const num = line.match(/\bnumber\s+(\S+)/i) ?? line.match(/\b(\d+)\b/);
  if (num) return num[1];
  // "<text> watermark/badge/tag/label" → the descriptive word before the noun.
  const before = line.match(/\b(?:a|an|the)?\s*([A-Za-z0-9][\w#-]{0,24})\s+(?:watermark|badge|tag|label|stamp)\b/i);
  if (before) return before[1].trim();
  // "add/put/show <text> to/on/in ..." → the payload after the verb.
  const after = line.match(
    /\b(?:add|put|place|include|show|stamp)\s+(?:the\s+|a\s+|an\s+)?(?:word\s+|text\s+)?([A-Za-z0-9][\w .#-]{0,24}?)\s+(?:to|on|in|across)\b/i,
  );
  return after ? after[1].trim() : null;
}

/** Build helpful, concrete, context-aware suggestions for the next edit. */
function buildSuggestions(context: AnswerContext): string[] {
  const out: string[] = [];
  const unconfirmed = context.metrics.find((m) => !m.isConfirmed || /to confirm/i.test(m.value ?? ""));
  if (unconfirmed) out.push(`Set ${unconfirmed.label} to <value>`);
  else out.push("Set Average inspection score to 92%");
  const priority = context.priorities[0];
  if (priority) out.push(`Reword the ${priority.title} priority to <new wording>`);
  else out.push("Add a priority: <title>");
  out.push("Add what's-next item: Window washing proposal in June");
  return out;
}

/**
 * Parse a chat instruction into deck edits. Splits on newlines / "and" so a
 * single message can carry multiple edits. Returns operations + a confirming
 * reply; when nothing parses, asks the user to be specific (no-op, no rebuild).
 */
export function parseSlideEditFallback(message: string, context: AnswerContext): SlideEditResult {
  const segments = message
    .split(/\n|(?:,?\s+\band\b\s+)|;/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed: Parsed[] = [];
  for (const seg of segments) {
    const p = parseOne(seg);
    if (p) parsed.push(p);
  }
  // If splitting produced nothing, try the whole message as one instruction.
  if (parsed.length === 0) {
    const p = parseOne(message);
    if (p) parsed.push(p);
  }

  if (parsed.length === 0) {
    return {
      reply:
        'I can edit the deck for you — tell me what to change with a value, e.g. "Set Average inspection score to 92%", "Add what\'s-next item: window washing proposal in June", "Mark the dock-access follow-up as complete", or "Remove the parking priority". I\'ll regenerate the PowerPoint right after.',
      operations: [],
      patches: [],
      regenerate: false,
      suggestions: buildSuggestions(context),
    };
  }

  const reply =
    parsed.length === 1
      ? `Done — ${parsed[0].describe.charAt(0).toLowerCase()}${parsed[0].describe.slice(1)}, and I've regenerated the deck. Anything else?`
      : `Done — I applied ${parsed.length} changes and regenerated the deck:\n${parsed.map((p) => `• ${p.describe}`).join("\n")}\nAnything else?`;

  return {
    reply,
    operations: parsed.map((p) => p.op),
    patches: [],
    regenerate: true,
    suggestions: buildSuggestions(context),
  };
}
