import { Readable } from "stream";
import path from "path";
import { WorkspaceClient } from "@databricks/sdk-experimental";
import { env } from "../env";

let client: WorkspaceClient | null = null;

function getClient(): WorkspaceClient {
  if (!client) {
    client = new WorkspaceClient({});
  }
  return client;
}

/** UC Volume root path, e.g. /Volumes/catalog/schema/volume */
export function volumeRoot(): string {
  const root = env.UC_VOLUME_PATH?.trim();
  if (!root) throw new Error("UC_VOLUME_PATH is not configured");
  return root.replace(/\/$/, "");
}

/** Absolute UC path for a file relative to the volume root. */
export function volumeFilePath(relativePath: string): string {
  const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.includes("..")) throw new Error("Invalid storage path");
  return `${volumeRoot()}/${rel}`;
}

async function streamToBuffer(contents: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of contents) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function volumeRead(relativePath: string): Promise<Buffer> {
  const filePath = volumeFilePath(relativePath);
  const response = await getClient().files.download({ file_path: filePath });
  if (!response.contents) {
    throw new Error(`Empty response downloading ${filePath}`);
  }
  return streamToBuffer(response.contents);
}

export async function volumeWrite(
  relativePath: string,
  data: Buffer | Uint8Array | string,
): Promise<void> {
  const filePath = volumeFilePath(relativePath);
  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  if (buf.length === 0) {
    throw new Error(`Refusing to upload empty file to ${filePath}`);
  }

  const directoryPath = path.posix.dirname(filePath);
  await getClient().files.createDirectory({ directory_path: directoryPath });

  const webStream = Readable.toWeb(Readable.from(buf));
  await getClient().apiClient.request({
    path: `/api/2.0/fs/files${filePath}`,
    method: "PUT",
    headers: new Headers({ "Content-Type": "application/octet-stream" }),
    raw: false,
    query: { overwrite: true },
    payload: webStream,
  });
}
