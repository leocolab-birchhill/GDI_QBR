import { NextResponse } from "next/server";
import { getQbrFull } from "@/lib/qbr/service";
import { isQbrAccess, requireQbrAccessApi } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await requireQbrAccessApi(req, params.id);
  if (!isQbrAccess(access)) return access;

  const qbr = await getQbrFull(params.id);
  if (!qbr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(qbr);
}
