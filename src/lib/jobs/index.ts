import { prisma } from "../db";
import { audit } from "../audit";
import { sendQbrEmail } from "../email";
import * as tpl from "../email/templates";
import { summarizeQbrForVp } from "../ai";
import {
  generateDraft,
  getQbrFull,
  setStatus,
  findOrCreateAccount,
  findOrCreateCycle,
} from "../qbr/service";
import {
  getSettings,
  parseList,
  DEFAULT_CLIENT_SURVEY,
  DEFAULT_INTERNAL_SURVEY,
} from "../qbr/settings";

/**
 * Reminder engine. Each function is callable manually (via /api-test/jobs or the
 * BR workspace buttons) and is structured so a cron scheduler can later invoke
 * `runDueJobs()` on a fixed interval.
 */

type Qbr = NonNullable<Awaited<ReturnType<typeof getQbrFull>>>;

async function recipientFor(
  qbr: Qbr,
  who: "director" | "vp" | "manager",
): Promise<string> {
  const settings = await getSettings();
  const fallback = settings.sharedMailbox;
  if (who === "director") return qbr.account.director?.email ?? fallback;
  if (who === "vp") return qbr.account.vpOwner?.email ?? fallback;
  return qbr.account.accountManager?.email ?? fallback;
}

export async function sendMonthlyCheckIn(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "director");
  const content = tpl.monthlyCheckIn({ clientName: qbr.account.clientName });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.monthlyCheckIn",
  });
}

export async function send60DayDirectorReminder(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "director");
  const content = tpl.genericReply({
    title: `60-day check-in - ${qbr.account.clientName}`,
    body: "We're 60 days from the BR. Please share: open issues, client concerns, and upcoming work.",
  });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.60day",
  });
}

export async function send45DayMetricReminder(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "manager");
  // Decision-tree: only ask for metrics relevant to deployed data sources.
  const settings = await getSettings();
  const placeholders = safeJson(settings.dataSourcePlaceholdersJson);
  const asks: string[] = ["Commitment statuses"];
  if (placeholders.gdiInspect)
    asks.push(
      "Average inspection score, inspections completed, open deficiencies",
    );
  if (placeholders.cleanCorrect)
    asks.push("CleanCorrect usage/deployment metrics");
  asks.push("Health & Safety: incidents, injuries, near misses");
  if (placeholders.finance) asks.push("Billing: outstanding invoices");
  const content = tpl.genericReply({
    title: `45-day metrics request - ${qbr.account.clientName}`,
    body: `Please provide dashboard metrics:\n${asks.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
  });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.45day",
  });
}

export async function send30DayVpSummary(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "vp");
  const result = await summarizeQbrForVp({
    clientName: qbr.account.clientName,
    quarter: qbr.quarter,
    data: {
      status: qbr.status,
      commitments: qbr.commitments,
      priorityItems: qbr.priorityItems,
      dashboardMetrics: qbr.dashboardMetrics,
      upcomingItems: qbr.upcomingItems,
      missingInfoRequests: qbr.missingInfoRequests,
    },
  });
  const content = tpl.vpSummary({
    clientName: qbr.account.clientName,
    quarter: qbr.quarter,
    summary: result.summary,
  });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await setStatus(qbrCycleId, "PREP_FINAL_SPRINT");
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.30dayVpSummary",
    metadata: { missingFields: result.missingFields },
  });
}

export async function send14DayDraftReminder(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "manager");
  const content = tpl.genericReply({
    title: `14-day draft reminder - ${qbr.account.clientName}`,
    body: 'We\'re 14 days out. Reply "Generate draft" to produce the first deck, or use the workspace button.',
  });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.14dayDraft",
  });
}

export async function sendFinalReviewReminder(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const to = await recipientFor(qbr, "vp");
  const content = tpl.genericReply({
    title: `Final review reminder - ${qbr.account.clientName}`,
    body: "We're 3-5 days from the meeting. Please review the latest draft and reply APPROVE or send edits.",
  });
  await sendQbrEmail({
    to,
    qbrCycleId,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "reminder.finalReview",
  });
}

export async function sendPostQbrSurveys(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return;
  const settings = await getSettings();
  const clientQs = parseList(
    settings.clientSurveyTemplateJson,
    DEFAULT_CLIENT_SURVEY,
  );
  const internalQs = parseList(
    settings.internalSurveyTemplateJson,
    DEFAULT_INTERNAL_SURVEY,
  );

  const clientTo = qbr.account.contacts[0]?.email ?? settings.sharedMailbox;
  const clientContent = tpl.clientSurvey({
    clientName: qbr.account.clientName,
    questions: clientQs,
  });
  await sendQbrEmail({
    to: clientTo,
    qbrCycleId,
    subject: clientContent.subject,
    text: clientContent.text,
    html: clientContent.html,
  });

  const internalTo = await recipientFor(qbr, "vp");
  const internalContent = tpl.internalSurvey({
    clientName: qbr.account.clientName,
    questions: internalQs,
  });
  await sendQbrEmail({
    to: internalTo,
    qbrCycleId,
    subject: internalContent.subject,
    text: internalContent.text,
    html: internalContent.html,
  });

  await setStatus(qbrCycleId, "SURVEY_SENT");
  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "surveys.sent",
  });
}

/**
 * Roll commitments and open risks forward into the next quarter's cycle:
 *   - previous commitments -> open follow-ups
 *   - open priority items / survey concerns -> priority candidates
 *   - upcoming items -> reminders for the new cycle
 *   - missing items -> follow-up questions
 */
export async function rollForwardNextQbr(qbrCycleId: string) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) return null;

  const { nextQuarter, nextYear } = nextQ(qbr.quarter, qbr.year);
  const account = await findOrCreateAccount(qbr.account.clientName);
  const next = await findOrCreateCycle({
    accountId: account.id,
    quarter: nextQuarter,
    year: nextYear,
  });

  for (const c of qbr.commitments) {
    if (c.status !== "Complete") {
      await prisma.commitment.create({
        data: {
          qbrCycleId: next.id,
          action: c.action,
          status: c.status === "Complete" ? "Complete" : "Open",
          owner: c.owner,
          dueDate: c.dueDate,
          rawInput: c.rawInput,
          clientReadyText: c.clientReadyText,
          isClientSafe: c.isClientSafe,
          source: "rollforward",
        },
      });
    }
  }

  for (const p of qbr.priorityItems) {
    await prisma.priorityItem.create({
      data: {
        qbrCycleId: next.id,
        title: p.title,
        rawInput: p.rawInput,
        clientReadyText: p.clientReadyText,
        category: p.category,
        timing: p.timing,
      },
    });
  }

  for (const u of qbr.upcomingItems) {
    await prisma.missingInfoRequest.create({
      data: {
        qbrCycleId: next.id,
        field: `upcoming:${u.title}`,
        question: `Status update: ${u.title}`,
        status: "Open",
      },
    });
  }

  // Survey concerns -> priority candidates.
  for (const s of qbr.clientSurveys) {
    if (s.comments) {
      await prisma.priorityItem.create({
        data: {
          qbrCycleId: next.id,
          title: "Client feedback follow-up",
          rawInput: s.comments,
          category: "Relationship",
        },
      });
    }
  }

  await audit({
    entityType: "QbrCycle",
    entityId: next.id,
    action: "qbr.rolledForward",
    metadata: { from: qbrCycleId },
  });
  await setStatus(qbrCycleId, "CLOSED");
  return next;
}

function nextQ(
  quarter: string,
  year: number,
): { nextQuarter: string; nextYear: number } {
  const n = parseInt(quarter.replace(/\D/g, ""), 10) || 1;
  if (n >= 4) return { nextQuarter: "Q1", nextYear: year + 1 };
  return { nextQuarter: `Q${n + 1}`, nextYear: year };
}

function safeJson(s: string): Record<string, boolean> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * Generate-first-draft convenience used by 14-day reminder demos.
 * Kept here so the jobs surface can also trigger a draft if desired.
 */
export async function generateDraftJob(qbrCycleId: string) {
  return generateDraft(qbrCycleId);
}
