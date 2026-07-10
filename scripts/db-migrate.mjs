#!/usr/bin/env node
/**
 * Apply Prisma migrations against Postgres or Lakebase.
 * After migrate, grants table access to GRANT_APP_PGUSER when set (recommended).
 */
import { execSync } from "node:child_process";
import { resolveDatabaseUrl, prismaCliPath } from "./lakebase-url.mjs";

async function maybeGrantAppAccess() {
  const appRole = process.env.GRANT_APP_PGUSER?.trim();
  if (!appRole) {
    console.log(
      "[db:migrate] Tip: set GRANT_APP_PGUSER to your app's service principal client ID, then run `npm run db:grant`.",
    );
    return;
  }
  console.log("[db:migrate] Running db:grant for app service principal…");
  execSync("node scripts/db-grant-app.mjs", { stdio: "inherit", env: process.env });
}

async function main() {
  process.env.DATABASE_URL = await resolveDatabaseUrl();
  const prismaBin = prismaCliPath();
  console.log("[db:migrate] Running prisma migrate deploy…");
  execSync(`node "${prismaBin}" migrate deploy`, {
    stdio: "inherit",
    env: process.env,
  });
  await maybeGrantAppAccess();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
