#!/usr/bin/env node
/**
 * Seed demo data using the same Lakebase / DATABASE_URL resolution as db:migrate.
 */
import { execSync } from "node:child_process";
import { resolveDatabaseUrl } from "./lakebase-url.mjs";

async function main() {
  process.env.DATABASE_URL = await resolveDatabaseUrl();
  // Seed via standard PrismaClient + DATABASE_URL (not the app's SP adapter).
  delete process.env.DATABRICKS_CLIENT_ID;

  console.log("[db:seed] Running prisma/seed.ts…");
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
