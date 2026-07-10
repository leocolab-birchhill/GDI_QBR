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

/**
 * Build an authenticated Files API URL + headers using the SDK's config
 * (works with the Databricks Apps service-principal OAuth injected at runtime).
 */
async function filesApiRequest(
  filePath: string,
  extraHeaders?: Record<string, string>,
): Promise<{ url: URL; headers: Headers }> {
  const config = getClient().config;
  const headers = new Headers(extraHeaders ?? {});
  await config.authenticate(headers);
  const host = await config.getHost();
  const url = new URL(host.toString());
  url.pathname = `/api/2.0/fs/files${filePath}`;
  return { url, headers };
}

export async function volumeRead(relativePath: string): Promise<Buffer> {
  const filePath = volumeFilePath(relativePath);
  const response = await getClient().files.download({ file_path: filePath });
  if (!response.contents) {
    throw new Error(`Empty response downloading ${filePath}`);
  }
  return streamToBuffer(response.contents as AsyncIterable<Uint8Array>);
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

  // Upload with native fetch instead of the SDK. The SDK's request() only
  // streams bodies that are instances of its OWN internal ReadableStream
  // subclass; anything else (including Readable.toWeb output) gets
  // JSON.stringify'd, which turns binary payloads into the literal string "{}"
  // — corrupting every uploaded PPTX. Its files.upload() is equally broken
  // (generated code drops the contents entirely).
  const { url, headers } = await filesApiRequest(filePath, {
    "Content-Type": "application/octet-stream",
  });
  url.search = "overwrite=true";

  const res = await fetch(url, {
    method: "PUT",
    headers,
    body: new Uint8Array(buf),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Volume upload failed (${res.status} ${res.statusText}) for ${filePath}: ${text}`,
    );
  }

  // Verify the stored size matches what we sent so a corrupted write fails
  // loudly here instead of surfacing later as a blank/unreadable deck.
  const meta = await getClient().files.getMetadata({ file_path: filePath });
  const storedLength = Number(meta["content-length"] ?? NaN);
  if (Number.isFinite(storedLength) && storedLength !== buf.length) {
    throw new Error(
      `Volume upload size mismatch for ${filePath}: sent ${buf.length} bytes, stored ${storedLength}`,
    );
  }
}
