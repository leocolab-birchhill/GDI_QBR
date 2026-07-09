/**
 * Build a Prisma-compatible Postgres URL from Lakebase / Databricks Apps env vars.
 * OAuth auth for real connections uses @databricks/lakebase (adapter or migrate script).
 */

export function isValidPostgresUrl(url?: string | null): boolean {
  if (!url?.trim()) return false;
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

export function lakebaseEnvPresent(): boolean {
  return Boolean(
    process.env.PGHOST?.trim() &&
      process.env.PGDATABASE?.trim() &&
      process.env.LAKEBASE_ENDPOINT?.trim(),
  );
}

export interface LakebaseConnectionParts {
  host: string;
  port: string;
  database: string;
  user: string;
  sslmode: string;
  password?: string;
}

/** Read Lakebase connection parts from standard Databricks Apps env injection. */
export function readLakebaseParts(): LakebaseConnectionParts | null {
  if (!lakebaseEnvPresent()) return null;

  const host = process.env.PGHOST!.trim();
  const database = process.env.PGDATABASE!.trim();
  const user = (process.env.PGUSER || process.env.DATABRICKS_CLIENT_ID || "").trim();
  if (!user) {
    throw new Error(
      "Lakebase is configured (PGHOST/PGDATABASE/LAKEBASE_ENDPOINT) but PGUSER or DATABRICKS_CLIENT_ID is missing.",
    );
  }

  return {
    host,
    port: (process.env.PGPORT || "5432").trim(),
    database,
    user,
    sslmode: (process.env.PGSSLMODE || "require").trim(),
  };
}

/** Build postgresql:// URL. Password omitted when using the Lakebase OAuth adapter. */
export function buildPostgresUrl(parts: LakebaseConnectionParts): string {
  const auth = parts.password
    ? `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}`
    : encodeURIComponent(parts.user);

  const params = new URLSearchParams({
    sslmode: parts.sslmode || "require",
    schema: "public",
  });

  return `postgresql://${auth}@${parts.host}:${parts.port}/${parts.database}?${params.toString()}`;
}

/**
 * Ensure process.env.DATABASE_URL is a valid Postgres URL.
 * - Keeps an existing valid postgres/postgresql URL (e.g. docker compose local dev).
 * - Builds from PGHOST/PGDATABASE/LAKEBASE_ENDPOINT on Databricks Apps (no password; adapter handles OAuth).
 */
export function ensureDatabaseUrl(): string {
  const existing = process.env.DATABASE_URL?.trim();
  if (isValidPostgresUrl(existing)) {
    return existing!;
  }

  const lakebase = readLakebaseParts();
  if (lakebase) {
    const url = buildPostgresUrl(lakebase);
    process.env.DATABASE_URL = url;
    return url;
  }

  const fallback = "postgresql://qbr:qbr@localhost:5432/qbr?schema=public";

  if (existing && !isValidPostgresUrl(existing)) {
    const onDatabricks = Boolean(process.env.DATABRICKS_CLIENT_ID?.trim());
    if (onDatabricks || lakebaseEnvPresent()) {
      throw new Error(
        `DATABASE_URL is not a Postgres URL (got "${existing.slice(0, 40)}..."). ` +
          "On Databricks, remove DATABASE_URL from .env — the app builds it from PGHOST/PGDATABASE. " +
          "For local dev use docker compose Postgres, or set Lakebase vars and run `databricks auth login` before `npm run db:migrate`.",
      );
    }
    console.warn(
      `[databaseUrl] Ignoring non-Postgres DATABASE_URL (${existing.slice(0, 24)}…); using local docker default.`,
    );
    process.env.DATABASE_URL = fallback;
    return fallback;
  }

  process.env.DATABASE_URL = fallback;
  return fallback;
}
