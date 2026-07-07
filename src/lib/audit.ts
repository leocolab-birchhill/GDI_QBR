import { prisma } from "./db";

/**
 * Append an immutable audit entry. Used for AI extraction, deck generation,
 * reminders, approvals, revisions, and finalization.
 */
export async function audit(params: {
  entityType: string;
  entityId?: string | null;
  action: string;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        action: params.action,
        actorEmail: params.actorEmail ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    // Auditing must never break the main flow.
    console.error("[audit] failed to write audit log:", err);
  }
}
