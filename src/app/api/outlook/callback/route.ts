import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/email/providers/graphAuth";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

/** OAuth redirect target. Exchanges the code for tokens and stores them. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const errorDesc = req.nextUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${env.APP_URL}/admin/settings?graph_error=${encodeURIComponent(errorDesc ?? error)}`,
    );
  }
  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    await exchangeCodeForTokens(code);
    await audit({ entityType: "EmailAccount", entityId: "graph", action: "graph.connected" });
    return NextResponse.redirect(`${env.APP_URL}/admin/settings?graph_connected=1`);
  } catch (err) {
    console.error("[outlook/callback] token exchange failed:", err);
    return NextResponse.redirect(
      `${env.APP_URL}/admin/settings?graph_error=${encodeURIComponent((err as Error).message)}`,
    );
  }
}
