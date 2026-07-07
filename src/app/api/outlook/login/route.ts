import { NextResponse } from "next/server";
import { buildAuthUrl, isGraphConfigured } from "@/lib/email/providers/graphAuth";

/** Kick off the Microsoft sign-in. Visit this URL once to connect the mailbox. */
export async function GET() {
  if (!isGraphConfigured()) {
    return NextResponse.json(
      { error: "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are not set in your environment." },
      { status: 400 },
    );
  }
  return NextResponse.redirect(buildAuthUrl());
}
