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

function validateAppRole(appRole) {
  if (/\s/.test(appRole)) {
    throw new Error(
      `GRANT_APP_PGUSER must be the service principal Client ID (UUID), not the display name.\n` +
        `You set: "${appRole}"\n` +
        `Find the Client ID in: Databricks Apps → business-review-agent → Environment tab → PGUSER\n` +
        `It looks like a UUID or numeric client id — no spaces.`,
    );
  }
}

async function listCandidateRoles(client) {
  const { rows } = await client.query(
    `SELECT rolname FROM pg_roles
     WHERE rolcanlogin
       AND rolname NOT LIKE 'pg_%'
       AND rolname NOT IN ('PUBLIC', 'postgres', 'cloud_admin', 'databricks_superuser')
     ORDER BY rolname`,
  );
  if (rows.length === 0) return "";
  return `\nExisting login roles in this database:\n${rows.map((r) => `  - ${r.rolname}`).join("\n")}`;
}

async function main() {
  const appRole = process.env.GRANT_APP_PGUSER?.trim();
  if (!appRole) {
    throw new Error(
      "GRANT_APP_PGUSER is required — set it to your Databricks App service principal Client ID.\n" +
        "Find it in: Databricks Apps → your app → Environment tab → PGUSER (when app is Running)\n" +
        "NOT the service principal display name (e.g. 'app-xxx business-review-agent').",
    );
  }
  validateAppRole(appRole);

  const connectionString = await resolveDatabaseUrl();
  const role = quoteIdent(appRole);

  console.log(`[db:grant] Connecting as migrator and granting access to ${appRole}…`);

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
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
  } catch (err) {
    if (String(err.message).includes("does not exist")) {
      const roles = await listCandidateRoles(client);
      throw new Error(
        `Postgres role "${appRole}" does not exist yet.${roles}\n\n` +
          "The app's Lakebase role is created when the app runs with the postgres resource attached.\n" +
          "1. Ensure the app is deployed and Running on Databricks\n" +
          "2. Copy PGUSER from the app's Environment tab (Client ID, not display name)\n" +
          "3. Re-run: export GRANT_APP_PGUSER=<that-value> && npm run db:grant",
      );
    }
    throw err;
  } finally {
    await client.end();
  }

  console.log("[db:grant] Done — the app service principal can now read/write all tables.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
