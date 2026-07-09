import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createLakebasePool } from "@databricks/lakebase";

/**
 * Singleton Prisma client (avoids exhausting connections during HMR in dev).
 *
 * Production (Databricks Apps + Lakebase): uses @databricks/lakebase OAuth pool
 * when LAKEBASE_ENDPOINT or PGHOST is present.
 *
 * Local dev: standard DATABASE_URL (docker compose Postgres).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function usesLakebase(): boolean {
  return Boolean(
    process.env.LAKEBASE_ENDPOINT?.trim() ||
      (process.env.PGHOST?.trim() && process.env.DATABRICKS_CLIENT_ID?.trim()),
  );
}

function createPrismaClient(): PrismaClient {
  const log =
    process.env.NODE_ENV === "development"
      ? (["warn", "error"] as const)
      : (["error"] as const);

  if (usesLakebase()) {
    const pool = createLakebasePool();
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter, log: [...log] });
  }

  return new PrismaClient({ log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
