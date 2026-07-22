import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthUser, qbrScopeFilter, requireUserApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** List QBRs with summary info — scoped to the caller's role/region/ownership. */
export async function GET(req: Request) {
  const user = await requireUserApi(req);
  if (!isAuthUser(user)) return user;

  const cycles = await prisma.qbrCycle.findMany({
    where: qbrScopeFilter(user),
    orderBy: { updatedAt: "desc" },
    include: {
      account: true,
      missingInfoRequests: { where: { status: "Open" } },
      deckVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
  return NextResponse.json(
    cycles.map((c) => ({
      id: c.id,
      clientName: c.account.clientName,
      quarter: c.quarter,
      year: c.year,
      status: c.status,
      meetingDate: c.meetingDate,
      openMissingInfo: c.missingInfoRequests.length,
      latestDeck: c.deckVersions[0]?.fileUrl ?? null,
    })),
  );
}
