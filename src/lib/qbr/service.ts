import { prisma } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { rewriteClientSafe } from "../ai";
import { ExtractionResult, SlideEditOp } from "../ai/schemas";
import { TO_CONFIRM, QbrStatus, METRIC_GROUPS } from "../constants";
import { resolveQbrLocale } from "../i18n";
import { generateQbrDeck, DeckOptions } from "../ppt/generateQbrDeck";
import { saveFile, readFile } from "../storage";
import { buildSlideContent } from "./slideContent";
import { findExisting } from "./dedupe";

/** Find an account by (fuzzy) client name, or create one. */
export async function findOrCreateAccount(clientName: string) {
  const existing = await prisma.account.findFirst({
    where: { clientName: { equals: clientName } },
  });
  if (existing) return existing;
  // Case-insensitive fallback (SQLite default collation is case-sensitive for some).
  const all = await prisma.account.findMany();
  const match = all.find((a) => a.clientName.toLowerCase() === clientName.toLowerCase());
  if (match) return match;
  return prisma.account.create({ data: { clientName } });
}

/** Find an existing cycle for account/quarter/year or create a new one. */
export async function findOrCreateCycle(args: {
  accountId: string;
  quarter: string;
  year: number;
  meetingDate?: Date | null;
  createdById?: string | null;
  previousQbrNotes?: string | null;
}) {
  const existing = await prisma.qbrCycle.findFirst({
    where: { accountId: args.accountId, quarter: args.quarter, year: args.year },
  });
  if (existing) return existing;
  const cycle = await prisma.qbrCycle.create({
    data: {
      accountId: args.accountId,
      quarter: args.quarter,
      year: args.year,
      meetingDate: args.meetingDate ?? null,
      createdById: args.createdById ?? null,
      previousQbrNotes: args.previousQbrNotes ?? null,
      status: "DRAFT_CREATED",
    },
  });
  await audit({ entityType: "QbrCycle", entityId: cycle.id, action: "qbr.created", metadata: args });
  return cycle;
}

export async function setStatus(qbrCycleId: string, status: QbrStatus) {
  await prisma.qbrCycle.update({ where: { id: qbrCycleId }, data: { status } });
  await audit({ entityType: "QbrCycle", entityId: qbrCycleId, action: `status.${status}` });
}

/** Default missing-info checklist created when a QBR starts. */
export async function createMissingInfoChecklist(qbrCycleId: string) {
  const items = [
    { field: "followUpStatuses", question: "Previous follow-up statuses" },
    { field: "priorityItems", question: "2-3 priority items" },
    { field: "dashboardMetrics", question: "Dashboard metrics" },
    { field: "upcomingItems", question: "What's Next items" },
    { field: "nextQbrDate", question: "Proposed next QBR date" },
  ];
  for (const it of items) {
    const exists = await prisma.missingInfoRequest.findFirst({
      where: { qbrCycleId, field: it.field },
    });
    if (!exists) {
      await prisma.missingInfoRequest.create({
        data: { qbrCycleId, field: it.field, question: it.question, status: "Open" },
      });
    }
  }
}

/** Parse the stored deck-options JSON blob into an object (never throws). */
export function readDeckOptions(deckOptionsJson?: string | null): DeckOptions & Record<string, unknown> {
  if (!deckOptionsJson) return {};
  try {
    const o = JSON.parse(deckOptionsJson);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** Merge a partial set of deck options into the cycle's stored JSON blob. */
async function mergeDeckOptions(qbrCycleId: string, patch: Record<string, unknown>): Promise<void> {
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  const current = readDeckOptions(cycle?.deckOptionsJson);
  const next = { ...current, ...patch };
  await prisma.qbrCycle.update({
    where: { id: qbrCycleId },
    data: { deckOptionsJson: JSON.stringify(next) },
  });
}

function normalizeGroup(group?: string): string {
  if (!group) return "Operational";
  const raw = group.trim();
  const g = group.toLowerCase();
  if (g.includes("safety") || g.includes("health")) return "Health & Safety";
  if (g.includes("financ") || g.includes("billing") || g.includes("invoice")) return "Financial";
  if (g.includes("operat")) return "Operational";
  return raw || "Operational";
}

/**
 * Detailed result of applying an extraction. `changed` holds human-readable
 * lines for ONLY what was newly created or actually updated (drives the
 * "Captured" section so we never echo unchanged items or repeat a metric).
 */
export interface ApplyExtractionResult {
  counts: { commitments: number; priorities: number; metrics: number; upcoming: number; answers: number };
  changed: string[];
}

/**
 * Apply an AI/heuristic extraction to a cycle: rewrite raw text into client-safe
 * language, and persist commitments, priorities, metrics, upcoming items, and
 * missing-info answers. Raw input and client-ready text are stored separately.
 *
 * Duplicate prevention: before creating any item we look for an existing item
 * with the same normalized label/title (same cycle). If found we UPDATE it in
 * place (when something differs) instead of creating a duplicate; only clearly
 * distinct items create a new row. Returns exactly what changed.
 */
export async function applyExtraction(
  qbrCycleId: string,
  ex: ExtractionResult,
  actorEmail?: string,
): Promise<ApplyExtractionResult> {
  const counts = { commitments: 0, priorities: 0, metrics: 0, upcoming: 0, answers: 0 };
  const changed: string[] = [];

  const [existingCommitments, existingPriorities, existingMetrics, existingUpcoming] =
    await Promise.all([
      prisma.commitment.findMany({ where: { qbrCycleId } }),
      prisma.priorityItem.findMany({ where: { qbrCycleId } }),
      prisma.dashboardMetric.findMany({ where: { qbrCycleId } }),
      prisma.upcomingItem.findMany({ where: { qbrCycleId } }),
    ]);

  for (const c of ex.commitments) {
    const safe = await rewriteClientSafe({ rawText: c.rawInput || c.action });
    const match = findExisting(existingCommitments, c.action, (x) => x.action);
    if (match) {
      const nextStatus = c.status || match.status;
      const nextOwner = c.owner ?? match.owner;
      if (nextStatus !== match.status || nextOwner !== match.owner) {
        await prisma.commitment.update({
          where: { id: match.id },
          data: { status: nextStatus, owner: nextOwner, dueDate: parseDate(c.dueDate) ?? match.dueDate },
        });
        changed.push(`Follow-up updated: ${c.action} [${nextStatus}]`);
        counts.commitments++;
      }
      continue;
    }
    const created = await prisma.commitment.create({
      data: {
        qbrCycleId,
        action: c.action,
        status: c.status || "Open",
        owner: c.owner,
        dueDate: parseDate(c.dueDate),
        rawInput: c.rawInput || c.action,
        clientReadyText: safe.clientReadyText,
        isClientSafe: true,
        source: "email",
      },
    });
    existingCommitments.push(created);
    changed.push(`Follow-up: ${c.action} [${created.status}]`);
    counts.commitments++;
  }

  for (const p of ex.priorityItems) {
    const match = findExisting(existingPriorities, p.title, (x) => x.title);
    if (match) continue; // already captured — don't duplicate
    const safe = await rewriteClientSafe({ rawText: p.rawInput || p.title });
    const created = await prisma.priorityItem.create({
      data: {
        qbrCycleId,
        title: p.title,
        rawInput: p.rawInput || p.title,
        clientReadyText: safe.clientReadyText,
        category: p.category,
        needsDecision: p.needsDecision ?? false,
        timing: p.timing,
        sortOrder: existingPriorities.length,
      },
    });
    existingPriorities.push(created);
    changed.push(`Priority: ${p.title}`);
    counts.priorities++;
  }

  for (const m of ex.metrics) {
    // Never invent values: unknown -> "To confirm", isConfirmed=false.
    const value = m.value && m.value.trim() ? m.value.trim() : TO_CONFIRM;
    const isConfirmed = value !== TO_CONFIRM && (m.isConfirmed ?? true);
    const group = normalizeGroup(m.group);
    const match = findExisting(existingMetrics, m.label, (x) => x.label);
    if (match) {
      // Update only when this carries a new, real value (don't overwrite a real
      // value with "To confirm", and don't re-report an unchanged metric).
      if (value !== TO_CONFIRM && value !== match.value) {
        await prisma.dashboardMetric.update({
          where: { id: match.id },
          data: { value, isConfirmed, group },
        });
        changed.push(`${group}: ${m.label} = ${value}`);
        counts.metrics++;
      }
      continue;
    }
    const created = await prisma.dashboardMetric.create({
      data: { qbrCycleId, group, label: m.label, value, isConfirmed, source: "email" },
    });
    existingMetrics.push(created);
    changed.push(`${group}: ${m.label} = ${value}`);
    counts.metrics++;
  }

  for (const u of ex.upcomingItems) {
    const match = findExisting(existingUpcoming, u.title, (x) => x.title);
    if (match) continue; // already captured — don't duplicate
    const safe = await rewriteClientSafe({ rawText: u.rawInput || u.title });
    const created = await prisma.upcomingItem.create({
      data: {
        qbrCycleId,
        title: u.title,
        rawInput: u.rawInput || u.title,
        clientReadyText: safe.clientReadyText,
        timing: u.timing,
        sortOrder: existingUpcoming.length,
      },
    });
    existingUpcoming.push(created);
    changed.push(`What's next: ${u.title}`);
    counts.upcoming++;
  }

  for (const a of ex.missingInfoAnswers) {
    const req = await prisma.missingInfoRequest.findFirst({
      where: { qbrCycleId, field: a.field, status: "Open" },
    });
    if (req) {
      await prisma.missingInfoRequest.update({ where: { id: req.id }, data: { status: "Answered" } });
      changed.push(`Answered: ${req.question}`);
      counts.answers++;
    }
  }

  // Standardized meeting-date memory: persist this-meeting / next-meeting dates so
  // "when is the meeting?" and "when's the next QBR?" become answerable facts.
  const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
  const meetingDate = parseDate(ex.meetingDate);
  if (meetingDate && cycle && (!cycle.meetingDate || cycle.meetingDate.getTime() !== meetingDate.getTime())) {
    await prisma.qbrCycle.update({ where: { id: qbrCycleId }, data: { meetingDate } });
    changed.push(`Meeting date: ${meetingDate.toDateString()}`);
  }
  const nextMeetingDate = parseDate(ex.nextMeetingDate);
  if (
    nextMeetingDate &&
    cycle &&
    (!cycle.nextMeetingDate || cycle.nextMeetingDate.getTime() !== nextMeetingDate.getTime())
  ) {
    await prisma.qbrCycle.update({ where: { id: qbrCycleId }, data: { nextMeetingDate } });
    await prisma.missingInfoRequest.updateMany({
      where: { qbrCycleId, field: "nextQbrDate", status: "Open" },
      data: { status: "Answered" },
    });
    changed.push(`Next meeting date: ${nextMeetingDate.toDateString()}`);
  }

  await audit({
    entityType: "QbrCycle",
    entityId: qbrCycleId,
    action: "ai.extraction.applied",
    actorEmail,
    metadata: { counts, confidence: ex.confidence, needsHumanReview: ex.needsHumanReview },
  });

  return { counts, changed };
}

/**
 * Apply structured slide-edit operations (from the collaboration chat agent) to
 * a cycle's deck data. Returns human-readable descriptions of what changed so
 * the chat can confirm them. Unknown/duplicate targets are matched by
 * normalized label/title; missing targets create new items where it makes sense.
 */
export async function applySlideEdits(qbrCycleId: string, operations: SlideEditOp[]): Promise<string[]> {
  const changes: string[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "set_metric": {
        if (!op.label) break;
        const value = op.value?.trim() || TO_CONFIRM;
        const group = normalizeGroup(op.group ?? undefined);
        const metrics = await prisma.dashboardMetric.findMany({ where: { qbrCycleId } });
        const match = findExisting(metrics, op.label, (m) => m.label);
        if (match) {
          await prisma.dashboardMetric.update({
            where: { id: match.id },
            data: { value, group, isConfirmed: value !== TO_CONFIRM },
          });
          changes.push(`Updated metric "${op.label}" → ${value}`);
        } else {
          await prisma.dashboardMetric.create({
            data: { qbrCycleId, group, label: op.label, value, isConfirmed: value !== TO_CONFIRM, source: "editor" },
          });
          changes.push(`Added metric "${op.label}" (${group}) = ${value}`);
        }
        break;
      }
      case "remove_metric": {
        if (!op.label) break;
        const metrics = await prisma.dashboardMetric.findMany({ where: { qbrCycleId } });
        const match = findExisting(metrics, op.label, (m) => m.label);
        if (match) {
          await prisma.dashboardMetric.delete({ where: { id: match.id } });
          changes.push(`Removed metric "${op.label}"`);
        }
        break;
      }
      case "add_priority": {
        if (!op.title) break;
        const priorities = await prisma.priorityItem.findMany({ where: { qbrCycleId } });
        if (findExisting(priorities, op.title, (p) => p.title)) break;
        // Honor the user's exact wording. Only an explicitly supplied explanation
        // is stored as body text; when none is given we leave a clean "To confirm"
        // sentinel rather than fabricating prose from the title.
        const safe = op.explanation?.trim() ? op.explanation.trim() : TO_CONFIRM;
        await prisma.priorityItem.create({
          data: {
            qbrCycleId,
            title: op.title,
            rawInput: op.title,
            clientReadyText: safe,
            category: op.group ?? null,
            sortOrder: priorities.length,
          },
        });
        changes.push(`Added priority "${op.title}"`);
        break;
      }
      case "reword_priority": {
        if (!op.title) break;
        const priorities = await prisma.priorityItem.findMany({ where: { qbrCycleId } });
        const match = findExisting(priorities, op.title, (p) => p.title);
        // Rename the priority to the user's exact new wording. When the request
        // carries replacement text, treat it as the new TITLE verbatim (the
        // headline shown on the slide); keep existing body unless one is given.
        if (match && op.explanation?.trim()) {
          await prisma.priorityItem.update({
            where: { id: match.id },
            data: { title: op.explanation.trim(), rawInput: op.explanation.trim() },
          });
          changes.push(`Reworded priority "${match.title}" → "${op.explanation.trim()}"`);
        }
        break;
      }
      case "remove_priority": {
        if (!op.title) break;
        const priorities = await prisma.priorityItem.findMany({ where: { qbrCycleId } });
        const match = findExisting(priorities, op.title, (p) => p.title);
        if (match) {
          await prisma.priorityItem.delete({ where: { id: match.id } });
          changes.push(`Removed priority "${op.title}"`);
        }
        break;
      }
      case "add_upcoming": {
        if (!op.title) break;
        const upcoming = await prisma.upcomingItem.findMany({ where: { qbrCycleId } });
        if (findExisting(upcoming, op.title, (u) => u.title)) break;
        const safe = op.detail?.trim() ? op.detail.trim() : TO_CONFIRM;
        await prisma.upcomingItem.create({
          data: { qbrCycleId, title: op.title, rawInput: op.title, clientReadyText: safe, timing: op.detail ?? null, sortOrder: upcoming.length },
        });
        changes.push(`Added what's-next item "${op.title}"`);
        break;
      }
      case "remove_upcoming": {
        if (!op.title) break;
        const upcoming = await prisma.upcomingItem.findMany({ where: { qbrCycleId } });
        const match = findExisting(upcoming, op.title, (u) => u.title);
        if (match) {
          await prisma.upcomingItem.delete({ where: { id: match.id } });
          changes.push(`Removed what's-next item "${op.title}"`);
        }
        break;
      }
      case "add_commitment": {
        if (!op.action) break;
        const commitments = await prisma.commitment.findMany({ where: { qbrCycleId } });
        if (findExisting(commitments, op.action, (c) => c.action)) break;
        const safe = (await rewriteClientSafe({ rawText: op.action })).clientReadyText;
        await prisma.commitment.create({
          data: {
            qbrCycleId,
            action: op.action,
            status: op.status || "Open",
            owner: op.owner ?? null,
            dueDate: parseDate(op.date),
            rawInput: op.action,
            clientReadyText: safe,
            isClientSafe: true,
            source: "editor",
          },
        });
        changes.push(`Added follow-up "${op.action}"`);
        break;
      }
      case "set_commitment_status": {
        if (!op.action) break;
        const commitments = await prisma.commitment.findMany({ where: { qbrCycleId } });
        const match = findExisting(commitments, op.action, (c) => c.action);
        if (match) {
          await prisma.commitment.update({
            where: { id: match.id },
            data: {
              status: op.status || match.status,
              owner: op.owner ?? match.owner,
              dueDate: parseDate(op.date) ?? match.dueDate,
            },
          });
          changes.push(`Updated follow-up "${match.action}" → ${op.status || match.status}`);
        }
        break;
      }
      case "remove_commitment": {
        if (!op.action) break;
        const commitments = await prisma.commitment.findMany({ where: { qbrCycleId } });
        const match = findExisting(commitments, op.action, (c) => c.action);
        if (match) {
          await prisma.commitment.delete({ where: { id: match.id } });
          changes.push(`Removed follow-up "${op.action}"`);
        }
        break;
      }
      case "set_client_name": {
        const name = (op.value ?? op.label ?? "").trim();
        if (!name) break;
        const cycle = await prisma.qbrCycle.findUnique({ where: { id: qbrCycleId } });
        if (!cycle) break;
        await prisma.account.update({ where: { id: cycle.accountId }, data: { clientName: name } });
        changes.push(`Set client name → "${name}"`);
        break;
      }
      case "set_agenda": {
        const raw = (op.detail ?? op.value ?? "").trim();
        const agenda = raw
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (agenda.length === 0) break;
        await prisma.qbrCycle.update({
          where: { id: qbrCycleId },
          data: { agendaSectionsJson: JSON.stringify(agenda) },
        });
        changes.push(`Updated agenda (${agenda.length} sections)`);
        break;
      }
      case "set_meeting_date": {
        const d = parseDate(op.date);
        if (d) {
          await prisma.qbrCycle.update({ where: { id: qbrCycleId }, data: { meetingDate: d } });
          changes.push(`Set meeting date → ${d.toDateString()}`);
        }
        break;
      }
      case "set_next_meeting_date": {
        const d = parseDate(op.date);
        if (d) {
          await prisma.qbrCycle.update({ where: { id: qbrCycleId }, data: { nextMeetingDate: d } });
          await prisma.missingInfoRequest.updateMany({
            where: { qbrCycleId, field: "nextQbrDate", status: "Open" },
            data: { status: "Answered" },
          });
          changes.push(`Set next meeting date → ${d.toDateString()}`);
        }
        break;
      }
      case "set_page_numbers": {
        const v = (op.value ?? "on").toLowerCase();
        const on = !/^(off|no|false|hide|remove|none)$/.test(v);
        const position = /both/.test(v)
          ? "bottom-both"
          : /left/.test(v)
            ? "bottom-left"
            : "bottom-right";
        await mergeDeckOptions(qbrCycleId, { pageNumbers: on, pageNumberPosition: position });
        changes.push(on ? `Turned on page numbers (${position})` : "Turned off page numbers");
        break;
      }
      case "set_footer": {
        const text = (op.value ?? op.detail ?? "").trim();
        await mergeDeckOptions(qbrCycleId, { footerText: text || null });
        changes.push(text ? `Set footer text → "${text}"` : "Removed footer text");
        break;
      }
      case "set_title_tag": {
        const text = (op.value ?? op.label ?? "").trim();
        await mergeDeckOptions(qbrCycleId, { titleTag: text || null });
        changes.push(text ? `Added tag "${text}" to every slide` : "Removed slide tag");
        break;
      }
      case "set_deck_option": {
        if (!op.label) break;
        await mergeDeckOptions(qbrCycleId, { [op.label]: op.value ?? true });
        changes.push(`Set deck option "${op.label}" → ${op.value ?? "on"}`);
        break;
      }
    }
  }

  if (changes.length) {
    await audit({ entityType: "QbrCycle", entityId: qbrCycleId, action: "slides.edited", metadata: { changes } });
  }
  return changes;
}

export async function getQbrFull(qbrCycleId: string) {
  return prisma.qbrCycle.findUnique({
    where: { id: qbrCycleId },
    include: {
      account: { include: { vpOwner: true, director: true, accountManager: true, contacts: true } },
      createdBy: true,
      commitments: { orderBy: { createdAt: "asc" } },
      priorityItems: { orderBy: { sortOrder: "asc" } },
      dashboardMetrics: true,
      upcomingItems: { orderBy: { sortOrder: "asc" } },
      missingInfoRequests: true,
      deckVersions: { orderBy: { versionNumber: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      clientSurveys: true,
      internalSurveys: true,
      emailThreads: { include: { messages: { orderBy: { receivedAt: "asc" } } } },
    },
  });
}

/** Items that are not yet confirmed (drives the "Unconfirmed" list in replies). */
export function listUnconfirmed(qbr: NonNullable<Awaited<ReturnType<typeof getQbrFull>>>): string[] {
  const out: string[] = [];
  for (const m of qbr.dashboardMetrics) {
    if (!m.isConfirmed || m.value === TO_CONFIRM) out.push(`${m.label} (${m.group})`);
  }
  for (const r of qbr.missingInfoRequests) {
    if (r.status === "Open") out.push(r.question);
  }
  return out;
}

/**
 * Generate a deck version (.pptx) from DB state.
 *
 * `skipAi` renders straight from the structured data with the deterministic
 * renderer (no AI re-drafting). The live editor uses this so each edit turn is
 * fast and the output reflects the user's edits exactly — re-running the AI
 * drafter on every edit was both slow and could re-drift just-edited content.
 */
export async function generateDraft(
  qbrCycleId: string,
  opts?: { final?: boolean; skipAi?: boolean; keepStatus?: boolean; forceTranslate?: boolean },
) {
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) throw new Error("QBR not found");

  const slideContent = await buildSlideContent(qbr, {
    skipAi: opts?.skipAi,
    forceTranslate: opts?.forceTranslate,
  });
  const deckOptions = readDeckOptions(qbr.deckOptionsJson);
  // The account profile is the source of truth for the client logo shown in the
  // co-branding lockup; fall back to any per-deck override stored on the cycle.
  deckOptions.clientLogoUrl = qbr.account.logoUrl ?? deckOptions.clientLogoUrl ?? null;
  const locale = resolveQbrLocale(qbr);
  const buffer = await generateQbrDeck(slideContent, deckOptions, locale);

  const last = await prisma.deckVersion.findFirst({
    where: { qbrCycleId },
    orderBy: { versionNumber: "desc" },
  });
  const versionNumber = (last?.versionNumber ?? 0) + 1;
  const kind = opts?.final ? "Final" : `Draft_v${versionNumber}`;
  const safeName = `${qbr.account.clientName}_${qbr.quarter}_${qbr.year}_QBR_${kind}`
    .replace(/[^a-z0-9_]+/gi, "_");
  const fileName = `${safeName}.pptx`;
  const { fileUrl } = await saveFile(`decks/${qbrCycleId}/${fileName}`, buffer);
  // Absolute URL so it is clickable from emails/clients outside the app shell.
  const downloadUrl = `${env.APP_URL.replace(/\/$/, "")}${fileUrl}`;

  const deck = await prisma.deckVersion.create({
    data: {
      qbrCycleId,
      versionNumber,
      status: opts?.final ? "final" : "draft",
      fileUrl,
      title: fileName,
      // Snapshot the exact slide content this version rendered so the assistant
      // can later recall "what the last presentation said" and map it to a date.
      contentJson: JSON.stringify(slideContent),
    },
  });

  await audit({
    entityType: "DeckVersion",
    entityId: deck.id,
    action: opts?.final ? "deck.finalized" : "deck.generated",
    metadata: { versionNumber, fileName, slideCount: 7 },
  });

  // Move the cycle to DRAFT_GENERATED only for a real draft request — not when
  // we silently render a deck just to attach it to a routine reply (keepStatus).
  if (!opts?.final && !opts?.keepStatus) await setStatus(qbrCycleId, "DRAFT_GENERATED");

  return { deck, fileName, fileUrl, downloadUrl, buffer, unconfirmed: listUnconfirmed(qbr) };
}

/**
 * Get a deck buffer suitable for attaching to EVERY outbound reply.
 *
 * Prefers the most recent already-generated deck (no rebuild, no status change).
 * If none exists yet, renders one deterministically from current data so there
 * is always a .pptx to attach — without advancing the workflow status.
 */
export async function ensureDeckForAttachment(
  qbrCycleId: string,
): Promise<{ fileName: string; downloadUrl: string; buffer: Buffer }> {
  const latest = await getLatestDeck(qbrCycleId);
  if (latest) {
    return { fileName: latest.fileName, downloadUrl: latest.downloadUrl, buffer: latest.buffer };
  }
  const draft = await generateDraft(qbrCycleId, { skipAi: true, keepStatus: true });
  return { fileName: draft.fileName, downloadUrl: draft.downloadUrl, buffer: draft.buffer };
}

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Build an email attachment descriptor for a generated deck. */
export function deckAttachment(fileName: string, buffer: Buffer) {
  return { filename: fileName, contentType: PPTX_MIME, content: buffer };
}

/**
 * Load the most recent deck version's .pptx straight from storage (no rebuild).
 * Powers the "send me the current ppt" flow so the user instantly gets the file
 * that already exists. Returns null when no deck has been generated yet, or when
 * the stored file is missing (so the caller can fall back to generating one).
 */
export async function getLatestDeck(
  qbrCycleId: string,
): Promise<{ fileName: string; downloadUrl: string; buffer: Buffer; versionNumber: number; isFinal: boolean } | null> {
  const last = await prisma.deckVersion.findFirst({
    where: { qbrCycleId },
    orderBy: { versionNumber: "desc" },
  });
  if (!last?.fileUrl) return null;

  // fileUrl is like "/api/files/decks/<id>/<name>.pptx" → storage-relative path.
  const relativePath = last.fileUrl.replace(/^\/api\/files\//, "");
  const fileName = relativePath.split("/").pop() || `QBR_${qbrCycleId}.pptx`;
  try {
    const buffer = await readFile(relativePath);
    const downloadUrl = `${env.APP_URL.replace(/\/$/, "")}${last.fileUrl}`;
    return {
      fileName,
      downloadUrl,
      buffer,
      versionNumber: last.versionNumber,
      isFinal: last.status === "final",
    };
  } catch {
    return null;
  }
}

/** Record a VP approval. */
export async function recordApproval(args: {
  qbrCycleId: string;
  approverEmail: string;
  status: "approved" | "revision_requested" | "rejected";
  comments?: string;
}) {
  const approval = await prisma.approval.create({
    data: {
      qbrCycleId: args.qbrCycleId,
      approverEmail: args.approverEmail,
      status: args.status,
      comments: args.comments,
    },
  });
  await audit({
    entityType: "Approval",
    entityId: approval.id,
    action: `approval.${args.status}`,
    actorEmail: args.approverEmail,
  });
  if (args.status === "approved") await setStatus(args.qbrCycleId, "APPROVED");
  if (args.status === "revision_requested") await setStatus(args.qbrCycleId, "VP_REVIEW");
  return approval;
}

/** Does this cycle have a recorded VP approval? Required before finalization. */
export async function hasVpApproval(qbrCycleId: string): Promise<boolean> {
  const approval = await prisma.approval.findFirst({
    where: { qbrCycleId, status: "approved" },
  });
  return Boolean(approval);
}

export class FinalizationBlockedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "FinalizationBlockedError";
  }
}

/**
 * Pure finalization guard (no DB) — easy to unit test.
 * Throws FinalizationBlockedError when finalization is not permitted.
 */
export function assertCanFinalize(args: {
  hasVpApproval: boolean;
  unconfirmedMetricLabels: string[];
  allowOverride?: boolean;
}): void {
  if (!args.hasVpApproval) {
    throw new FinalizationBlockedError("VP approval is required before finalization.");
  }
  if (args.unconfirmedMetricLabels.length > 0 && !args.allowOverride) {
    throw new FinalizationBlockedError(
      `Unconfirmed metrics block finalization: ${args.unconfirmedMetricLabels.join(", ")}. Override required.`,
    );
  }
}

/**
 * Finalize a QBR. BLOCKED unless a VP approval exists. If required metrics are
 * unconfirmed, finalization is blocked unless settings allow override.
 */
export async function finalize(qbrCycleId: string, opts?: { allowOverride?: boolean }) {
  const approved = await hasVpApproval(qbrCycleId);
  const qbr = await getQbrFull(qbrCycleId);
  if (!qbr) throw new Error("QBR not found");

  const unconfirmedMetrics = qbr.dashboardMetrics.filter(
    (m) => !m.isConfirmed || m.value === TO_CONFIRM,
  );
  assertCanFinalize({
    hasVpApproval: approved,
    unconfirmedMetricLabels: unconfirmedMetrics.map((m) => m.label),
    allowOverride: opts?.allowOverride,
  });

  const result = await generateDraft(qbrCycleId, { final: true });
  await setStatus(qbrCycleId, "READY_FOR_MEETING");
  await audit({ entityType: "QbrCycle", entityId: qbrCycleId, action: "qbr.finalized" });
  return result;
}

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
