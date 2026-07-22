import { NextResponse } from "next/server";
import { testOpenAiConnectivity } from "@/lib/ai/connectivity";
import { isAuthUser, requireAdminApi } from "@/lib/auth";

export async function POST(req: Request) {
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  const result = await testOpenAiConnectivity();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
