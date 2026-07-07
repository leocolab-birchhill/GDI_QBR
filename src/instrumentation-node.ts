/**
 * Node-only side of the instrumentation hook: the background inbox poller.
 *
 * Imported lazily from src/instrumentation.ts only in the Node.js runtime, so
 * its server-only dependencies (Graph/Prisma/fs) never reach the Edge bundle.
 *
 * Intended for the local / single-instance deployment. For serverless or
 * multi-instance setups, disable this (run a single instance) and instead drive
 * POST /api/outlook/poll from an external cron or a Graph webhook subscription —
 * running multiple pollers against one mailbox can double-process emails.
 */
import { pollAndProcessInbox } from "./lib/email/poll";

const provider = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();

// Guard against duplicate intervals across HMR reloads in dev.
const g = globalThis as unknown as { __qbrPollerStarted?: boolean };

if (provider !== "graph") {
  console.log(`[poller] EMAIL_PROVIDER=${provider} — inbox poller disabled.`);
} else if (!g.__qbrPollerStarted) {
  g.__qbrPollerStarted = true;

  const seconds = Number(process.env.OUTLOOK_POLL_INTERVAL_SECONDS ?? "30");
  const intervalMs = Math.max(10, Number.isFinite(seconds) ? seconds : 30) * 1000;

  let running = false;
  const tick = async () => {
    if (running) return; // prevent overlap if a poll runs long
    running = true;
    try {
      const result = await pollAndProcessInbox();
      if (result.count > 0) {
        console.log(
          `[poller] processed ${result.count} email(s):`,
          result.processed.map((p) => `${p.intent} <${p.subject}>`).join("; "),
        );
      } else if (!result.ok && result.reason) {
        console.log(`[poller] idle: ${result.reason}`);
      }
    } catch (err) {
      console.error("[poller] error:", (err as Error).message);
    } finally {
      running = false;
    }
  };

  console.log(`[poller] starting inbox poller — every ${intervalMs / 1000}s`);
  // First run shortly after boot, then on the interval.
  setTimeout(tick, 5000);
  setInterval(tick, intervalMs);
}
