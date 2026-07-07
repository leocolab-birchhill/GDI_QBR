/**
 * Single source of truth for enum-like string values.
 * SQLite has no native enums, so these constants are the contract.
 */

export const QBR_STATUSES = [
  "DRAFT_CREATED",
  "COLLECTING_INPUTS",
  "PREP_FINAL_SPRINT",
  "DRAFT_GENERATED",
  "VP_REVIEW",
  "APPROVED",
  "READY_FOR_MEETING",
  "PRESENTED",
  "SURVEY_SENT",
  "CLOSED",
] as const;
export type QbrStatus = (typeof QBR_STATUSES)[number];

export const USER_ROLES = [
  "Admin",
  "VP",
  "Director",
  "AccountManager",
  "Viewer",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EMAIL_INTENTS = [
  "CREATE_QBR",
  "UPDATE_QBR",
  "ADD_COMMITMENT",
  "ADD_PRIORITY",
  "ADD_METRIC",
  "ADD_UPCOMING_ITEM",
  "ANSWER_MISSING_INFO",
  "REQUEST_DRAFT",
  "APPROVE_DRAFT",
  "REVISE_DRAFT",
  "FINALIZE_DRAFT",
  "SEND_SURVEY",
  "GENERAL_QUESTION",
  "UNKNOWN",
] as const;
export type EmailIntent = (typeof EMAIL_INTENTS)[number];

export const METRIC_GROUPS = ["Health & Safety", "Operational", "Financial"] as const;
export type MetricGroup = (typeof METRIC_GROUPS)[number];

export const TO_CONFIRM = "To confirm";

/** Supported UI/deck locales. French is the global default (Quebec launch). */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Statuses at which finalization is permitted (after VP approval). */
export const APPROVED_STATUSES: QbrStatus[] = ["APPROVED", "READY_FOR_MEETING"];
