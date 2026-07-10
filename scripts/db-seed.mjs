#!/usr/bin/env node
/**
 * Seed demo data using the same Lakebase / DATABASE_URL resolution as db:migrate.
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolveDatabaseUrl } from "./lakebase-url.mjs";

const require = createRequire(import.meta.url);

async function main() {
  process.env.DATABASE_URL = await resolveDatabaseUrl();
  // Seed via standard PrismaClient + DATABASE_URL (not the app's SP adapter).
  delete process.env.DATABRICKS_CLIENT_ID;

  const tsxBin = require.resolve("tsx/dist/cli.mjs");
  console.log("[db:seed] Running prisma/seed.ts…");
  execSync(`node "${tsxBin}" prisma/seed.ts`, {
    stdio: "inherit",
    env: process.env,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
