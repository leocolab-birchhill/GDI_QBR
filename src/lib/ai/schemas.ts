import { z } from "zod";
import { EMAIL_INTENTS, METRIC_GROUPS } from "../constants";

/** All AI outputs are validated against these Zod schemas before use. */

export const IntentSchema = z.object({
  intent: z.enum(EMAIL_INTENTS),
  confidence: z.number().min(0).max(1).default(0.5),
  reasoning: z.string().optional(),
});
export type IntentResult = z.infer<typeof IntentSchema>;

/** Language identification for an inbound email (fr-CA / en). */
export const LanguageSchema = z.object({
  language: z.enum(["fr", "en"]),
});
export type LanguageResult = z.infer<typeof LanguageSchema>;

export const CommitmentExtract = z.object({
  action: z.string(),
  status: z.string().optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  rawInput: z.string().optional(),
});

export const PriorityExtract = z.object({
  title: z.string(),
  rawInput: z.string().optional(),
  category: z.string().optional(),
  needsDecision: z.boolean().optional(),
  timing: z.string().optional(),
});

export const MetricExtract = z.object({
  group: z.string().optional(),
  label: z.string(),
  value: z.string().optional(),
  isConfirmed: z.boolean().optional(),
});

export const UpcomingExtract = z.object({
  title: z.string(),
  rawInput: z.string().optional(),
  timing: z.string().optional(),
});

export const MissingAnswerExtract = z.object({
  field: z.string(),
  answer: z.string(),
});

export const ExtractionSchema = z.object({
  intent: z.enum(EMAIL_INTENTS).default("UNKNOWN"),
  clientName: z.string().nullable().optional(),
  quarter: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  meetingDate: z.string().nullable().optional(),
  /** Proposed date of the NEXT QBR / meeting (distinct from this cycle's date). */
  nextMeetingDate: z.string().nullable().optional(),
  vpOwner: z.string().nullable().optional(),
  director: z.string().nullable().optional(),
  commitments: z.array(CommitmentExtract).default([]),
  priorityItems: z.array(PriorityExtract).default([]),
  metrics: z.array(MetricExtract).default([]),
  upcomingItems: z.array(UpcomingExtract).default([]),
  missingInfoAnswers: z.array(MissingAnswerExtract).default([]),
  approvalAction: z.enum(["approve", "revise", "finalize", "none"]).default("none"),
  revisionRequest: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  needsHumanReview: z.boolean().default(false),
});
export type ExtractionResult = z.infer<typeof ExtractionSchema>;

export const ClientSafeSchema = z.object({
  clientReadyText: z.string(),
  removedSensitiveContent: z.boolean().default(false),
});
export type ClientSafeResult = z.infer<typeof ClientSafeSchema>;

export const MissingInfoQuestionsSchema = z.object({
  questions: z.array(z.object({ field: z.string(), question: z.string() })).default([]),
});
export type MissingInfoQuestions = z.infer<typeof MissingInfoQuestionsSchema>;

export const SlideContentSchema = z.object({
  title: z.object({
    clientName: z.string(),
    quarterYear: z.string(),
    meetingMonthYear: z.string(),
  }),
  agenda: z.array(z.string()),
  followUps: z.array(
    z.object({
      number: z.number(),
      action: z.string(),
      status: z.string(),
      owner: z.string(),
      dueDate: z.string(),
    }),
  ),
  priorityItems: z.array(
    z.object({ number: z.number(), title: z.string(), explanation: z.string() }),
  ),
  dashboard: z.object({
    healthAndSafety: z.array(z.object({ label: z.string(), value: z.string() })),
    operational: z.array(z.object({ label: z.string(), value: z.string() })),
    financial: z.array(z.object({ label: z.string(), value: z.string() })),
    customGroups: z
      .array(
        z.object({
          title: z.string(),
          rows: z.array(z.object({ label: z.string(), value: z.string() })),
        }),
      )
      .optional(),
  }),
  whatsNext: z.array(z.object({ number: z.number(), title: z.string(), detail: z.string() })),
});
export type SlideContent = z.infer<typeof SlideContentSchema>;

export const ReviewSchema = z.object({
  isClientSafe: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestedRewrite: z.string().nullable().optional(),
});
export type ReviewResult = z.infer<typeof ReviewSchema>;

export const VpSummarySchema = z.object({
  summary: z.string(),
  missingFields: z.array(z.string()).default([]),
  itemsNeedingVpReview: z.array(z.string()).default([]),
});
export type VpSummaryResult = z.infer<typeof VpSummarySchema>;

export const QbrAnswerSchema = z.object({
  answer: z.string(),
  nextActions: z.array(z.string()).default([]),
});
export type QbrAnswerResult = z.infer<typeof QbrAnswerSchema>;

/** Hard actions the email agent can request the app to perform. */
export const QBR_AGENT_ACTIONS = [
  "none",
  "generate_draft",
  "send_deck",
  "approve",
  "revise",
  "finalize",
  "send_survey",
] as const;

export const QbrAgentSchema = z.object({
  /** Conversational reply shown to the user (like a chatbot answer). */
  reply: z.string(),
  /** Hard action the app must perform, if any. */
  action: z.enum(QBR_AGENT_ACTIONS).default("none"),
  /** Free-text revision instructions when action === "revise". */
  revisionNote: z.string().nullable().optional(),
  /** Short, concrete next steps for the user. */
  nextActions: z.array(z.string()).default([]),
});
export type QbrAgentResult = z.infer<typeof QbrAgentSchema>;

/** Edit operations the slide-editor agent can apply to QBR deck data. */
export const SLIDE_EDIT_OPS = [
  "set_metric",
  "remove_metric",
  "add_priority",
  "reword_priority",
  "remove_priority",
  "add_upcoming",
  "remove_upcoming",
  "add_commitment",
  "set_commitment_status",
  "remove_commitment",
  "set_client_name",
  "set_agenda",
  "set_meeting_date",
  "set_next_meeting_date",
  // Presentation-level (deck-wide) format edits.
  "set_page_numbers",
  "set_footer",
  "set_title_tag",
  "set_deck_option",
] as const;

export const SlideEditOpSchema = z.object({
  type: z.enum(SLIDE_EDIT_OPS),
  group: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  value: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  detail: z.string().nullable().optional(),
  action: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});
export type SlideEditOp = z.infer<typeof SlideEditOpSchema>;

export const SlideEditSchema = z.object({
  /** Conversational reply describing what was changed / asking clarifying Qs. */
  reply: z.string(),
  /** Structured edits to apply to the QBR deck data. */
  operations: z.array(SlideEditOpSchema).default([]),
  /** Whether to regenerate the .pptx after applying edits. */
  regenerate: z.boolean().default(true),
  /** Short suggested follow-up edits the agent offers to do next. */
  suggestions: z.array(z.string()).default([]),
});
export type SlideEditResult = z.infer<typeof SlideEditSchema>;

export { METRIC_GROUPS };
