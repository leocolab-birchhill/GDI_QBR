import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { requireAccountAccessApi } from "@/lib/auth";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Upload (or replace) a client/account logo. Accepts multipart/form-data with a
 * single `file` field. The image is stored under the account and saved to the
 * account profile (Account.logoUrl) so every deck for this client picks it up.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireAccountAccessApi(req, params.id, "canEditDeck");
  if (access instanceof NextResponse) return access;

  try {
    const account = await prisma.account.findUnique({ where: { id: params.id } });
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo must be 5 MB or smaller" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = EXT_BY_MIME[file.type] ?? "png";
    const fileName = `logo-${Date.now()}.${ext}`;
    const { fileUrl } = await saveFile(`logos/${account.id}/${fileName}`, buffer);

    await prisma.account.update({ where: { id: account.id }, data: { logoUrl: fileUrl } });
    await audit({
      entityType: "Account",
      entityId: account.id,
      action: "account.logo_uploaded",
      actorEmail: access.user.email,
      metadata: { fileUrl, mimeType: file.type, size: file.size },
    });

    return NextResponse.json({ ok: true, logoUrl: fileUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
