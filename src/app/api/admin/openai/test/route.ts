import { NextResponse } from "next/server";
import { testOpenAiConnectivity } from "@/lib/ai/connectivity";

export async function POST() {
  const result = await testOpenAiConnectivity();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
