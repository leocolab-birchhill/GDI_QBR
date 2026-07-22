import { prisma } from "@/lib/db";
import {
  buildAggregates,
  toDashboardCycle,
  type AuditEntry,
} from "@/lib/qbr/dashboard";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import { getStrings } from "@/lib/i18n";
import { requireAdminPage } from "@/lib/auth";
import DashboardView from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdminPage("/collaborate");

  const [rawCycles, rawAudit] = await Promise.all([
    prisma.qbrCycle.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        account: {
          include: {
            vpOwner: { select: { id: true, name: true, email: true } },
            director: { select: { id: true, name: true, email: true } },
            accountManager: { select: { id: true, name: true, email: true } },
          },
        },
        missingInfoRequests: { where: { status: "Open" } },
        dashboardMetrics: { select: { isConfirmed: true, value: true } },
        deckVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
        approvals: { where: { status: "approved" }, take: 1 },
        emailThreads: {
          include: {
            messages: {
              orderBy: { receivedAt: "desc" },
              take: 1,
              select: { receivedAt: true },
            },
          },
        },
      },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  const locale = getServerUiLocale();
  const s = getStrings(locale).dashboard;
  const cycles = rawCycles.map((c) => toDashboardCycle(c, locale));
  const aggregates = buildAggregates(cycles);

  const audit: AuditEntry[] = rawAudit.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    actorEmail: e.actorEmail,
    createdAt: e.createdAt.toISOString(),
  }));

  if (cycles.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{s.emptyTitle}</h1>
          <p className="text-muted-foreground">{s.subtitle}</p>
        </div>
        <div className="rounded-lg border bg-card py-10 text-center text-muted-foreground shadow-sm">
          {s.emptyState}{" "}
          <a href="/collaborate" className="text-primary underline">
            {getStrings(locale).nav.editor}
          </a>
        </div>
      </div>
    );
  }

  return (
    <DashboardView
      cycles={cycles}
      aggregates={aggregates}
      audit={audit}
      locale={locale}
    />
  );
}
