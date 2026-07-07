/**
 * Next.js instrumentation hook — runs once when the server process starts.
 *
 * We use it to start a background poller that pulls new emails from the connected
 * Microsoft Graph mailbox and runs them through the QBR pipeline, so the bot
 * responds to REAL inbound human emails (not just the front-end simulator).
 *
 * The actual poller lives in ./instrumentation-node so its Node-only imports
 * (fs/path/prisma) are never bundled into the Edge runtime. The
 * `NEXT_RUNTIME === "nodejs"` guard lets webpack drop that import from the edge
 * build entirely.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
