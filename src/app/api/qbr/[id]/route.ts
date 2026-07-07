import { NextResponse } from "next/server";
import { getQbrFull } from "@/lib/qbr/service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const qbr = await getQbrFull(params.id);
  if (!qbr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(qbr);
}
