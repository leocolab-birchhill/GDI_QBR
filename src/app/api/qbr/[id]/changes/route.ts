import { NextResponse } from "next/server";
import { listEditorChangeSets, proposalFieldChanges } from "@/lib/qbr/editorChangeSets";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id);
  if (!isQbrAccess(access)) return access;

  const url = new URL(req.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 30), 1), 100);
  const rows = await listEditorChangeSets(params.id, take);
  return NextResponse.json({
    changes: rows.map((row) => ({
      id: row.id,
      status: row.status,
      section: row.section,
      actorName: row.actorName,
      message: row.message,
      confidence: row.confidence,
      explanation: row.explanation,
      fieldChanges: proposalFieldChanges(row.fieldChangesJson),
      review: row.reviewJson ? JSON.parse(row.reviewJson) : null,
      revertsId: row.revertsId,
      createdAt: row.createdAt,
      appliedAt: row.appliedAt,
    })),
  });
}
