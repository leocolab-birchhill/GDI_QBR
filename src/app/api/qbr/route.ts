import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** List QBRs with summary info for the dashboard. */
export async function GET() {
  const cycles = await prisma.qbrCycle.findMany({
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
