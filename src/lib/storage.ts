import { promises as fs } from "fs";
import path from "path";
import { env } from "./env";

/**
 * Storage abstraction. Currently only the local backend is implemented.
 * TODO: add S3 / Azure Blob backends behind this same interface.
 */
const ROOT = path.resolve(process.cwd(), env.LOCAL_STORAGE_PATH);

export async function saveFile(
  relativePath: string,
  data: Buffer | Uint8Array | string,
): Promise<{ fileUrl: string; absolutePath: string }> {
  const absolutePath = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data as Buffer);
  // Served via the /api/files route (see src/app/api/files/[...path]/route.ts).
  const fileUrl = `/api/files/${relativePath.split(path.sep).join("/")}`;
  return { fileUrl, absolutePath };
}

export async function readFile(relativePath: string): Promise<Buffer> {
  const absolutePath = path.join(ROOT, relativePath);
  return fs.readFile(absolutePath);
}

export function storageRoot(): string {
  return ROOT;
}
