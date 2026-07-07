import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/qbr/settings";
import { audit } from "@/lib/audit";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Only allow known fields through.
    const allowed = [
      "sharedMailbox",
      "senderDisplayName",
      "reminderCadenceJson",
      "clientSurveyTemplateJson",
      "internalSurveyTemplateJson",
      "rolePermissionsJson",
      "requireVpApproval",
      "allowFinalizeOverride",
      "pptTemplatePath",
      "dataSourcePlaceholdersJson",
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) data[k] = body[k];
    const settings = await updateSettings(data);
    await audit({ entityType: "AppSettings", entityId: "default", action: "settings.updated", metadata: data });
    return NextResponse.json(settings);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
