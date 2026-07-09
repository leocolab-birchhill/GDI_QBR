#!/usr/bin/env node
/**
 * Apply Prisma migrations against Postgres or Lakebase.
 *
 * Lakebase (OAuth): set PGHOST, PGDATABASE, LAKEBASE_ENDPOINT, PGUSER (or DATABRICKS_CLIENT_ID),
 * then run `databricks auth login` locally OR deploy on Databricks Apps with the postgres resource.
 * This script fetches a short-lived OAuth token and builds a real DATABASE_URL for `prisma migrate deploy`.
 *
 * Local docker Postgres: set DATABASE_URL=postgresql://qbr:qbr@localhost:5432/qbr?schema=public
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function isValidPostgresUrl(url) {
  return Boolean(url?.trim()) && (url.startsWith("postgresql://") || url.startsWith("postgres://"));
}

function lakebaseEnvPresent() {
  return Boolean(
    process.env.PGHOST?.trim() &&
      process.env.PGDATABASE?.trim() &&
      process.env.LAKEBASE_ENDPOINT?.trim(),
  );
}

function buildPostgresUrl({ host, port, database, user, sslmode, password }) {
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  const params = new URLSearchParams({ sslmode: sslmode || "require", schema: "public" });
  return `postgresql://${auth}@${host}:${port}/${database}?${params.toString()}`;
}

function migrationHelp() {
  return `
Could not resolve a Postgres DATABASE_URL for prisma migrate deploy.

Option A — Lakebase from your laptop (OAuth, recommended for one-time migrate):
  1. databricks auth login --host https://<your-workspace>.azuredatabricks.net
  2. In Lakebase → Connect → Parameters only, copy:
       PGHOST          (endpoint hostname, e.g. ep-....database....databricks.com)
       PGDATABASE      (usually databricks_postgres)
       LAKEBASE_ENDPOINT (projects/.../branches/.../endpoints/...)
       PGUSER          (your Databricks email, NOT the app service principal)
       PGPORT=5432
       PGSSLMODE=require
  3. Export those vars (do NOT set DATABASE_URL to a fake value)
  4. npm run db:migrate

Option B — Local docker Postgres:
  docker compose up -d
  DATABASE_URL=postgresql://qbr:qbr@localhost:5432/qbr?schema=public npm run db:migrate

Option C — Temporary Lakebase URL with OAuth token (expires ~1 hour):
  postgresql://<PGUSER>:<oauth-token>@<PGHOST>:5432/<PGDATABASE>?sslmode=require&schema=public
  Get token via Databricks Lakebase Connect dialog or generateDatabaseCredential API.
`.trim();
}

async function resolveDatabaseUrl() {
  const existing = process.env.DATABASE_URL?.trim();
  if (isValidPostgresUrl(existing)) {
    console.log("[db:migrate] Using DATABASE_URL from environment.");
    return existing;
  }

  if (!lakebaseEnvPresent()) {
    throw new Error(migrationHelp());
  }

  const host = process.env.PGHOST.trim();
  const port = (process.env.PGPORT || "5432").trim();
  const database = process.env.PGDATABASE.trim();
  const user = (process.env.PGUSER || process.env.DATABRICKS_CLIENT_ID || "").trim();
  const sslmode = (process.env.PGSSLMODE || "require").trim();
  const endpoint = process.env.LAKEBASE_ENDPOINT.trim();

  if (!user) {
    throw new Error("Lakebase migrate requires PGUSER or DATABRICKS_CLIENT_ID.");
  }

  console.log("[db:migrate] Lakebase detected — fetching OAuth database credential…");
  const { generateDatabaseCredential, getWorkspaceClient } = await import("@databricks/lakebase");
  const workspaceClient = getWorkspaceClient();
  const credential = await generateDatabaseCredential(workspaceClient, { endpoint });

  const url = buildPostgresUrl({
    host,
    port,
    database,
    user,
    sslmode,
    password: credential.token,
  });

  console.log(
    `[db:migrate] Built DATABASE_URL for ${user}@${host}:${port}/${database} (OAuth token, ~1h lifetime).`,
  );
  return url;
}

async function main() {
  process.env.DATABASE_URL = await resolveDatabaseUrl();
  const prismaBin = require.resolve("prisma/build/index.js");
  console.log("[db:migrate] Running prisma migrate deploy…");
  execSync(`node "${prismaBin}" migrate deploy`, {
    stdio: "inherit",
    env: process.env,
  });
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
