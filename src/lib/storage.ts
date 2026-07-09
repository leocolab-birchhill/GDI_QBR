import { promises as fs } from "fs";
import path from "path";
import { env } from "./env";
import { volumeRead, volumeRoot, volumeWrite } from "./storage/volumeClient";

/**
 * Storage abstraction for generated artifacts (PPTX decks, logos, attachments).
 *
 * - local: filesystem under LOCAL_STORAGE_PATH (local dev)
 * - volume: Unity Catalog volume via Databricks Files API (Databricks Apps prod)
 */
const LOCAL_ROOT = path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);

function backend(): "local" | "volume" {
  return env.STORAGE_BACKEND;
}

export async function saveFile(
  relativePath: string,
  data: Buffer | Uint8Array | string,
): Promise<{ fileUrl: string; absolutePath: string }> {
  const rel = relativePath.replace(/\\/g, "/");
  if (rel.includes("..")) throw new Error("Invalid storage path");

  if (backend() === "volume") {
    await volumeWrite(rel, data);
    const fileUrl = `/api/files/${rel}`;
    return { fileUrl, absolutePath: volumeFilePathForDisplay(rel) };
  }

  const absolutePath = path.join(LOCAL_ROOT, rel);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data as Buffer);
  const fileUrl = `/api/files/${rel.split(path.sep).join("/")}`;
  return { fileUrl, absolutePath };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  const rel = relativePath.replace(/\\/g, "/");
  if (rel.includes("..")) throw new Error("Invalid storage path");

  if (backend() === "volume") {
    return volumeRead(rel);
  }

  const absolutePath = path.join(LOCAL_ROOT, rel);
  return fs.readFile(absolutePath);
}

export function storageRoot(): string {
  if (backend() === "volume") {
    return volumeRoot();
  }
  return LOCAL_ROOT;
}

function volumeFilePathForDisplay(relativePath: string): string {
  return `${volumeRoot()}/${relativePath.replace(/\\/g, "/")}`;
}
