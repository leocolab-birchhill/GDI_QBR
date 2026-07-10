#!/usr/bin/env node
/**
 * Grant the Databricks App service principal access to all Prisma tables.
 *
 * Required when migrations were applied with YOUR user email but the app connects
 * as the app's service principal (PGUSER = client id on Databricks Apps).
 *
 * Usage (after npm run db:migrate):
 *   export GRANT_APP_PGUSER="<app-service-principal-client-id>"
 *   # same DATABASE_URL or Lakebase vars + token you used for migrate
 *   npm run db:grant
 */
import pg from "pg";
import { resolveDatabaseUrl } from "./lakebase-url.mjs";

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const appRole = process.env.GRANT_APP_PGUSER?.trim();
  if (!appRole) {
    throw new Error(
      "GRANT_APP_PGUSER is required — set it to your Databricks App service principal client ID.\n" +
        "Find it in: Databricks Apps → your app → Authorization / Service principal → Client ID\n" +
        "(Same value as PGUSER when the app runs on Databricks.)",
    );
  }

  const connectionString = await resolveDatabaseUrl();
  const role = quoteIdent(appRole);

  console.log(`[db:grant] Connecting as migrator and granting access to ${appRole}…`);

  const client = new pg.Client({ connectionString });
  await client.connect();

  const statements = [
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${role}`,
    `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`,
  ];

  for (const sql of statements) {
    console.log(`[db:grant] ${sql}`);
    await client.query(sql);
  }

  await client.end();
  console.log("[db:grant] Done — the app service principal can now read/write all tables.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
