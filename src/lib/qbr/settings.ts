import { prisma } from "../db";

export interface ReminderCadence {
  monthlyCheckIn: boolean;
  daysBeforeDirector: number;
  daysBeforeMetrics: number;
  daysBeforeVpSummary: number;
  daysBeforeDraft: number;
  daysBeforeFinalReview: number;
  hoursAfterSurvey: number;
  daysAfterRollForward: number;
}

export const DEFAULT_CADENCE: ReminderCadence = {
  monthlyCheckIn: true,
  daysBeforeDirector: 60,
  daysBeforeMetrics: 45,
  daysBeforeVpSummary: 30,
  daysBeforeDraft: 14,
  daysBeforeFinalReview: 4,
  hoursAfterSurvey: 24,
  daysAfterRollForward: 7,
};

export const DEFAULT_CLIENT_SURVEY = [
  "Overall rating (0-10)",
  "Service quality vs expectations",
  "Issue resolution",
  "Communication",
  "Administration",
  "Billing / reporting",
  "Open comments",
];

export const DEFAULT_INTERNAL_SURVEY = [
  "How do you think the client felt? (0-10)",
  "What went well?",
  "What concerns remain?",
  "What commitments were made?",
];

export async function getSettings() {
  const existing = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.appSettings.create({
    data: {
      id: "default",
      reminderCadenceJson: JSON.stringify(DEFAULT_CADENCE),
      clientSurveyTemplateJson: JSON.stringify(DEFAULT_CLIENT_SURVEY),
      internalSurveyTemplateJson: JSON.stringify(DEFAULT_INTERNAL_SURVEY),
      rolePermissionsJson: JSON.stringify({}),
      dataSourcePlaceholdersJson: JSON.stringify({
        finance: false,
        tickets: false,
        gdiInspect: false,
        cleanCorrect: false,
        contracts: false,
      }),
    },
  });
}

export async function updateSettings(data: Record<string, unknown>) {
  return prisma.appSettings.upsert({
    where: { id: "default" },
    update: data as any,
    create: { id: "default", ...(data as any) },
  });
}

export function parseCadence(json: string): ReminderCadence {
  try {
    return { ...DEFAULT_CADENCE, ...JSON.parse(json) };
  } catch {
    return DEFAULT_CADENCE;
  }
}

export function parseList(json: string, fallback: string[]): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length ? v : fallback;
  } catch {
    return fallback;
  }
}
