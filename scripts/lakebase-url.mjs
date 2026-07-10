import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function isValidPostgresUrl(url) {
  return Boolean(url?.trim()) && (url.startsWith("postgresql://") || url.startsWith("postgres://"));
}

export function lakebaseEnvPresent() {
  return Boolean(
    process.env.PGHOST?.trim() &&
      process.env.PGDATABASE?.trim() &&
      process.env.LAKEBASE_ENDPOINT?.trim(),
  );
}

export function buildPostgresUrl({ host, port, database, user, sslmode, password }) {
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  const params = new URLSearchParams({ sslmode: sslmode || "require", schema: "public" });
  return `postgresql://${auth}@${host}:${port}/${database}?${params.toString()}`;
}

/**
 * Resolve a real postgres DATABASE_URL for CLI scripts (migrate, grant, seed).
 * Uses DATABASE_URL if valid, otherwise Lakebase OAuth token via @databricks/lakebase.
 */
export async function resolveDatabaseUrl() {
  const existing = process.env.DATABASE_URL?.trim();
  if (isValidPostgresUrl(existing)) {
    return existing;
  }

  if (!lakebaseEnvPresent()) {
    throw new Error(
      "Set DATABASE_URL to a postgresql:// URL, or export PGHOST/PGDATABASE/LAKEBASE_ENDPOINT for Lakebase OAuth.",
    );
  }

  const host = process.env.PGHOST.trim();
  const port = (process.env.PGPORT || "5432").trim();
  const database = process.env.PGDATABASE.trim();
  const user = (process.env.PGUSER || process.env.DATABRICKS_CLIENT_ID || "").trim();
  const sslmode = (process.env.PGSSLMODE || "require").trim();
  const endpoint = process.env.LAKEBASE_ENDPOINT.trim();

  if (!user) {
    throw new Error("Lakebase requires PGUSER or DATABRICKS_CLIENT_ID.");
  }

  const { generateDatabaseCredential, getWorkspaceClient } = await import("@databricks/lakebase");
  const workspaceClient = getWorkspaceClient();
  const credential = await generateDatabaseCredential(workspaceClient, { endpoint });

  return buildPostgresUrl({
    host,
    port,
    database,
    user,
    sslmode,
    password: credential.token,
  });
}

export function prismaCliPath() {
  return require.resolve("prisma/build/index.js");
}
