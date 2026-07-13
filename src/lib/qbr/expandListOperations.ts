import type { SlideEditOp } from "../ai/schemas";

type ListOpConfig = {
  primary: "title" | "action" | "label";
  secondary?: "explanation" | "detail" | "body" | "value";
  noun: RegExp;
};

const LIST_OPS: Partial<Record<SlideEditOp["type"], ListOpConfig>> = {
  add_priority: {
    primary: "title",
    secondary: "explanation",
    noun: /\bpriorit(?:y|ies)(?:\s+items?)?\b/i,
  },
  add_upcoming: {
    primary: "title",
    secondary: "detail",
    noun: /\b(?:upcoming|what'?s[\s-]?next)(?:\s+items?)?\b/i,
  },
  add_commitment: {
    primary: "action",
    noun: /\b(?:follow[\s-]?ups?|commitments?|actions?)(?:\s+items?)?\b/i,
  },
  add_slide: {
    primary: "title",
    secondary: "body",
    noun: /\bslides?\b/i,
  },
  set_metric: {
    primary: "label",
    secondary: "value",
    noun: /\bmetrics?\b/i,
  },
};

const EDIT_VERB = /\b(?:add|create|include|insert|new|set|update)\b/i;
const COUNT_HINT = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten|several|multiple)\b/i;

function cleanItem(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*•]\s*|\d+\s*[.)-]\s*)/, "")
    .replace(/^[\s:>\-–—]+/, "")
    .replace(/[.;]+$/, "")
    .trim();
}

function expectedCount(request: string): number | null {
  const match = request.match(/\b(\d+)\s+(?:different\s+)?(?:priority(?:\s+items?)?|priorities|items?|follow[\s-]?ups?|commitments?|actions?|upcoming(?:\s+items?)?|what'?s[\s-]?next(?:\s+items?)?|slides?|metrics?)\b/i);
  return match ? Number(match[1]) : null;
}

function listPayloadFromRequest(request: string, config: ListOpConfig): string | null {
  if (!EDIT_VERB.test(request) || !config.noun.test(request)) return null;
  const colon = request.indexOf(":");
  if (colon >= 0 && request.slice(colon + 1).trim()) return request.slice(colon + 1).trim();

  const nounMatch = config.noun.exec(request);
  if (!nounMatch) return null;
  const afterNoun = request.slice(nounMatch.index + nounMatch[0].length).replace(/^[\s:>\-–—]+/, "").trim();
  return afterNoun || null;
}

function splitList(payload: string, request: string): string[] {
  const normalized = payload
    .replace(/\r/g, "")
    .replace(/(?:^|\n)\s*(?=\d+\s*[.)-]\s*)/g, "\n")
    .trim();
  const count = expectedCount(request);
  const explicitList = /[\n;]/.test(normalized);
  const commaList = normalized.includes(",") && (count !== null || COUNT_HINT.test(request));

  let parts: string[];
  if (explicitList) {
    parts = normalized.split(/\n|;/);
  } else if (commaList) {
    parts = normalized.split(/\s*,\s*/);
  } else {
    return [];
  }

  parts = parts
    .flatMap((part) => part.split(/\s+(?:and|et)\s+(?=(?:[-*•]|\d+[.)-])?\s*\S+)/i))
    .map(cleanItem)
    .filter(Boolean);

  if (count !== null && parts.length !== count) return [];
  return parts.length > 1 ? parts : [];
}

function isInstructionTitle(value: string, config: ListOpConfig): boolean {
  return EDIT_VERB.test(value) && config.noun.test(value) && COUNT_HINT.test(value);
}

/**
 * Expands a model/fallback operation that contains a natural-language list into
 * one add operation per requested row. The original request is used to recover
 * items when a model puts the instruction in the title and the list in another
 * field—or omits all but the first item.
 */
export function expandListAddOperations(operations: SlideEditOp[], request: string): SlideEditOp[] {
  return operations.flatMap((op) => {
    const config = LIST_OPS[op.type];
    if (!config) return [op];

    const primary = String(op[config.primary] ?? "").trim();
    const secondary = config.secondary ? String(op[config.secondary] ?? "").trim() : "";
    const requestPayload = listPayloadFromRequest(request, config);
    const instructionTitle = isInstructionTitle(primary, config);
    const recoverFromRequest = operations.length === 1 && (instructionTitle || expectedCount(request) !== null);
    const candidates = [
      recoverFromRequest ? requestPayload : null,
      instructionTitle ? secondary : null,
      instructionTitle ? null : primary,
    ].filter((value): value is string => Boolean(value));

    let items: string[] = [];
    for (const candidate of candidates) {
      items = splitList(candidate, request);
      if (items.length > 1) break;
    }
    if (items.length < 2) return [op];

    return items.map((item) => {
      const next: SlideEditOp = { ...op, [config.primary]: item };
      if (config.secondary) {
        const divider = item.match(/^(.+?)\s*(?:=|:|\bto\b)\s*(.+)$/i);
        if (divider) {
          next[config.primary] = cleanItem(divider[1]);
          next[config.secondary] = cleanItem(divider[2]);
        } else {
          next[config.secondary] = undefined;
        }
      }
      return next;
    });
  });
}
