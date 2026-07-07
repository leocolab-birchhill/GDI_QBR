import { EmailIntent } from "../constants";
import { TO_CONFIRM } from "../constants";
import {
  ClientSafeResult,
  ExtractionResult,
  IntentResult,
  MissingInfoQuestions,
  ReviewResult,
} from "./schemas";

/**
 * Deterministic, dependency-free fallbacks used when OPENAI_API_KEY is not
 * configured (or AI validation fails). These keep the full email→DB→deck flow
 * working offline for the MVP and for tests.
 */

export function fallbackClassify(input: { subject: string; body: string }): IntentResult {
  const s = `${input.subject}\n${input.body}`.toLowerCase();
  const intent = detectIntent(s);
  return { intent, confidence: 0.4, reasoning: "heuristic fallback (no OpenAI key)" };
}

function detectIntent(s: string): EmailIntent {
  if (/\bfinalize\b/.test(s)) return "FINALIZE_DRAFT";
  if (/\brevise\b|soften|do not mention|don't mention|reword/.test(s)) return "REVISE_DRAFT";
  if (/\bapprove\b/.test(s)) return "APPROVE_DRAFT";
  if (/generate draft|generate the draft|request draft|create draft|draft deck/.test(s))
    return "REQUEST_DRAFT";
  // Creating a QBR, or onboarding a brand-new client/account, both bootstrap a
  // cycle via the CREATE_QBR path (which calls findOrCreateAccount).
  if (
    /start qbr|create qbr|new qbr|begin qbr|create (a )?(new )?(account|client)|new (account|client)|set ?up (a )?(new )?(account|client)|onboard|nouveau compte|nouveau client|cr[ée]er (un )?(nouveau )?(compte|client)/.test(
      s,
    )
  )
    return "CREATE_QBR";
  // Status / help requests want information back, not a content submission.
  if (
    /what (do|does) (you|the bot) (still )?need|what'?s (missing|outstanding|left)|where (are we|do (we|things) stand)|status (update|report|check)?|give me (an|a) (update|summary|status)|how('?s| is) (it|this) (going|looking)/.test(
      s,
    )
  )
    return "GENERAL_QUESTION";
  if (/survey|feedback|rating/.test(s)) return "SEND_SURVEY";
  if (/priority/.test(s)) return "ADD_PRIORITY";
  if (/metric|inspection score|injuries|invoice/.test(s)) return "ADD_METRIC";
  if (/upcoming|what'?s next|proposal|quote/.test(s)) return "ADD_UPCOMING_ITEM";
  if (/commitment|follow.?up|action item/.test(s)) return "ADD_COMMITMENT";
  if (/check-?in|update|concern|issue/.test(s)) return "UPDATE_QBR";
  if (/\?$/m.test(s)) return "GENERAL_QUESTION";
  return "UPDATE_QBR";
}

export function fallbackExtract(input: {
  subject: string;
  body: string;
  knownClient?: string;
}): ExtractionResult {
  const text = `${input.subject}\n${input.body}`;
  const intent = detectIntent(text.toLowerCase());

  const clientName =
    field(input.body, "client") ??
    clientFromSubject(input.subject) ??
    extractClientNameHint(input.subject, input.body) ??
    input.knownClient ??
    null;
  const quarterRaw = field(input.body, "quarter") ?? quarterFromText(text);
  const quarter = normalizeQuarter(quarterRaw);
  const year = yearFromText(text);
  const { meetingDate, nextMeetingDate } = extractMeetingDates(text);
  const vpOwner = field(input.body, "vp") ?? null;
  const director = field(input.body, "director") ?? null;

  const commitments: ExtractionResult["commitments"] = [];
  const priorityItems: ExtractionResult["priorityItems"] = [];
  const metrics: ExtractionResult["metrics"] = [];
  const upcomingItems: ExtractionResult["upcomingItems"] = [];

  const lower = input.body.toLowerCase();

  // Health & Safety: injuries / incidents
  const injuries = lower.match(/(\d+)\s+injur/);
  if (injuries) metrics.push({ group: "Health & Safety", label: "Injuries reported", value: injuries[1], isConfirmed: true });
  else if (/no injur|zero injur|no safety incident|no incident/.test(lower))
    metrics.push({ group: "Health & Safety", label: "Injuries reported", value: "0", isConfirmed: true });

  const inspection = lower.match(/inspection score[^0-9]*([0-9]+(?:\.[0-9]+)?%?)/);
  if (inspection) metrics.push({ group: "Operational", label: "Average inspection score", value: inspection[1], isConfirmed: true });

  // Priority candidates / upcoming items from sentences.
  const sentences = input.body
    .split(/[\n.]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const sl = sentence.toLowerCase();
    if (/(quote|proposal|window washing|will prepare|upcoming|next quarter|in june|in july)/.test(sl)) {
      upcomingItems.push({ title: shortTitle(sentence), rawInput: sentence });
    } else if (/(issue|problem|concern|difficulty|access|complaint|frustrat|wage|parking)/.test(sl)) {
      priorityItems.push({ title: shortTitle(sentence), rawInput: sentence, category: "Operational" });
    }
  }

  const approvalAction: ExtractionResult["approvalAction"] =
    intent === "APPROVE_DRAFT"
      ? "approve"
      : intent === "REVISE_DRAFT"
        ? "revise"
        : intent === "FINALIZE_DRAFT"
          ? "finalize"
          : "none";

  return {
    intent,
    clientName,
    quarter,
    year,
    meetingDate,
    nextMeetingDate,
    vpOwner,
    director,
    commitments,
    priorityItems,
    metrics,
    upcomingItems,
    missingInfoAnswers: [],
    approvalAction,
    revisionRequest: approvalAction === "revise" ? input.body.trim() : null,
    confidence: 0.4,
    needsHumanReview: true,
  };
}

export function fallbackRewrite(rawText: string): ClientSafeResult {
  // Light cleanup: strip obvious blame language, capitalize, ensure punctuation.
  const sensitive = /(mad|angry|frustrat|pissed|stupid|incompeten|blame|hate|fault)/i.test(rawText);
  let text = rawText
    .replace(/\b(the client is mad|client is angry|they are pissed)[^.]*/gi, "Client satisfaction remains a focus area")
    .trim();
  if (text && !/[.!?]$/.test(text)) text += ".";
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const prefix = sensitive ? "GDI is actively addressing this item. " : "";
  return { clientReadyText: `${prefix}${text}`.trim(), removedSensitiveContent: sensitive };
}

export function fallbackMissingInfoQuestions(knownFields: string[]): MissingInfoQuestions {
  const all = [
    { field: "followUpStatuses", question: "Previous follow-up statuses" },
    { field: "priorityItems", question: "2-3 priority items" },
    { field: "dashboardMetrics", question: "Dashboard metrics" },
    { field: "upcomingItems", question: "What's Next items" },
    { field: "nextQbrDate", question: "Proposed next QBR date" },
  ];
  return { questions: all.filter((q) => !knownFields.includes(q.field)) };
}

export function fallbackReview(text: string): ReviewResult {
  const issues: string[] = [];
  if (/(mad|angry|frustrat|blame|fault|incompeten|stupid)/i.test(text))
    issues.push("Contains potentially sensitive/blaming language.");
  return { isClientSafe: issues.length === 0, issues, suggestedRewrite: null };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function field(body: string, name: string): string | null {
  const re = new RegExp(`^\\s*${name}\\s*[:\\-]\\s*(.+)$`, "im");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Pull an explicit client/account name out of free-text requests such as:
 *   - Create a new account called "Client 1"
 *   - Set up a new client named Acme Corp
 *   - New account for University of Montreal and send me the deck
 * Returns the captured name (without surrounding quotes) or null. Conservative:
 * only matches when the text clearly names an account/client.
 */
export function extractClientNameHint(subject: string, body: string): string | null {
  const text = `${subject}\n${body}`;
  const QUOTES = "\"'“”‘’«»";
  const stop = "(?=\\s+(?:and|et|to|for|pour|with|avec|please|svp|so|then|puis|in|on|q[1-4]|t[1-4])\\b|[,.;:\\n]|$)";

  // 1. Quoted name following an account/client/called/named cue.
  let m = text.match(
    new RegExp(`\\b(?:account|client|company|compte|called|named|appel[ée]e?|nomm[ée]e?)\\b[^${QUOTES}]{0,30}[${QUOTES}]([^${QUOTES}]{1,60})[${QUOTES}]`, "i"),
  );
  if (m) return cleanName(m[1]);

  // 2. Any quoted phrase of reasonable length (e.g. an email that just quotes the name).
  m = text.match(new RegExp(`[${QUOTES}]([^${QUOTES}]{2,60})[${QUOTES}]`));
  if (m) return cleanName(m[1]);

  // 3. Unquoted "called/named X" up to a connector or punctuation.
  m = text.match(new RegExp(`\\b(?:called|named|appel[ée]e?|nomm[ée]e?)\\s+([A-Za-z0-9][\\w .&'-]{1,58}?)${stop}`, "i"));
  if (m) return cleanName(m[1]);

  // 4. Unquoted "account/client for X".
  m = text.match(new RegExp(`\\b(?:account|client|compte)\\s+(?:for|pour)\\s+([A-Za-z0-9][\\w .&'-]{1,58}?)${stop}`, "i"));
  if (m) return cleanName(m[1]);

  return null;
}

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 2 ? name : null;
}

function clientFromSubject(subject: string): string | null {
  // e.g. "Start QBR - McGill University - Q1 2026"
  const m = subject.match(/qbr\s*[-–]\s*(.+?)\s*[-–]\s*q[1-4]/i);
  if (m) return m[1].trim();
  const m2 = subject.match(/[-–]\s*([A-Z][\w .&']+?)\s*[-–]/);
  return m2 ? m2[1].trim() : null;
}

function quarterFromText(text: string): string | null {
  const m = text.match(/\bq([1-4])\b/i);
  return m ? `Q${m[1]}` : null;
}

function normalizeQuarter(q: string | null): string | null {
  if (!q) return null;
  const m = q.match(/([1-4])/);
  return m ? `Q${m[1]}` : q;
}

function yearFromText(text: string): number | null {
  const m = text.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function shortTitle(sentence: string): string {
  const words = sentence.trim().split(/\s+/).slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MONTHS =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/**
 * Loose date parser for operator notes. Recognizes "July 16", "July 16 2026",
 * "16 July", "2026-07-16", and "7/16/2026". Returns an ISO yyyy-mm-dd string or
 * null. Never throws; only returns a date when one is clearly present.
 */
export function parseLooseDate(input: string, fallbackYear?: number | null): string | null {
  const s = input.trim();
  if (!s) return null;

  // ISO yyyy-mm-dd
  let m = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // m/d/yyyy or m/d/yy
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(yr, +m[1], +m[2]);
  }

  // "July 16" / "July 16, 2026"
  m = s.match(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?`, "i"));
  if (m) return iso(m[3] ? +m[3] : yearFor(fallbackYear), monthNum(m[1]), +m[2]);

  // "16 July" / "16 July 2026"
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\.?(?:,?\\s+(20\\d{2}))?`, "i"));
  if (m) return iso(m[3] ? +m[3] : yearFor(fallbackYear), monthNum(m[2]), +m[1]);

  return null;
}

function iso(year: number, month: number, day: number): string | null {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function yearFor(fallbackYear?: number | null): number {
  return fallbackYear ?? new Date().getFullYear();
}

function monthNum(name: string): number {
  const key = name.slice(0, 3).toLowerCase();
  return (
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key) + 1
  );
}

const NEXT_MEETING_RE =
  /(next (?:meeting|qbr|review|sync|session|catch[\s-]?up)|next time we meet|meet (?:again|next)|follow[\s-]?up meeting|propose(?:d)? (?:to )?meet|reconvene)/i;

/**
 * Pull this-meeting and next-meeting dates from free text. A date that appears in
 * a sentence mentioning "next meeting/QBR/review" is treated as the NEXT meeting;
 * an explicit "meeting date:" field or other dated sentence is treated as THIS
 * meeting. Conservative: only assigns dates it can actually parse.
 */
export function extractMeetingDates(text: string): {
  meetingDate: string | null;
  nextMeetingDate: string | null;
} {
  const fallbackYear = yearFromText(text);
  const explicit = field(text, "meeting date");
  let meetingDate = explicit ? parseLooseDate(explicit, fallbackYear) : null;
  let nextMeetingDate: string | null = null;

  const sentences = text.split(/[\n.;]+/).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const date = parseLooseDate(sentence, fallbackYear);
    if (!date) continue;
    if (NEXT_MEETING_RE.test(sentence)) {
      if (!nextMeetingDate) nextMeetingDate = date;
    } else if (/\b(meeting|qbr|review|meet|present)\b/i.test(sentence) && !meetingDate) {
      meetingDate = date;
    }
  }

  return { meetingDate, nextMeetingDate };
}
