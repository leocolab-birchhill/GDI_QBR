#!/usr/bin/env node
/**
 * Production entrypoint for Databricks Apps.
 * 1. Apply Prisma migrations
 * 2. Optionally seed (RUN_DB_SEED=true, first deploy only)
 * 3. Start Next.js on DATABRICKS_APP_PORT
 */
import { execSync, spawnSync } from "node:child_process";

const port = process.env.DATABRICKS_APP_PORT || process.env.PORT || "8000";

function run(cmd, label) {
  console.log(`[start] ${label}…`);
  execSync(cmd, { stdio: "inherit", env: process.env });
}

try {
  run("npx prisma migrate deploy", "Applying database migrations");
} catch (err) {
  console.error("[start] prisma migrate deploy failed:", err.message);
  process.exit(1);
}

if (process.env.RUN_DB_SEED === "true") {
  try {
    run("npx tsx prisma/seed.ts", "Seeding database");
  } catch (err) {
    console.warn("[start] seed failed (non-fatal):", err.message);
  }
}

console.log(`[start] Starting Next.js on 0.0.0.0:${port}`);
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", port, "-H", "0.0.0.0"],
  { stdio: "inherit", env: process.env },
);

process.exit(result.status ?? 1);
