import { NextResponse } from "next/server";
import { readFile } from "@/lib/storage";
import path from "path";

/** Serve generated artifacts (PPTX, attachments) from local storage. */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  try {
    const rel = params.path.join(path.sep);
    // Prevent path traversal.
    if (rel.includes("..")) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    const data = await readFile(rel);
    const filename = params.path[params.path.length - 1];
    const isPptx = filename.endsWith(".pptx");
    return new NextResponse(data as any, {
      headers: {
        "Content-Type": isPptx
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
