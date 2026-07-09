import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createLakebasePool } from "@databricks/lakebase";
import { ensureDatabaseUrl, lakebaseEnvPresent } from "./databaseUrl";

/**
 * Singleton Prisma client (avoids exhausting connections during HMR in dev).
 *
 * Production (Databricks Apps + Lakebase): uses @databricks/lakebase OAuth pool
 * when PGHOST + LAKEBASE_ENDPOINT are injected by the platform.
 *
 * Local dev: standard DATABASE_URL (docker compose Postgres).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function usesLakebaseAdapter(): boolean {
  return lakebaseEnvPresent() && Boolean(process.env.DATABRICKS_CLIENT_ID?.trim());
}

function createPrismaClient(): PrismaClient {
  ensureDatabaseUrl();

  const log =
    process.env.NODE_ENV === "development"
      ? (["warn", "error"] as const)
      : (["error"] as const);

  if (usesLakebaseAdapter()) {
    const pool = createLakebasePool();
    const adapter = new PrismaPg(pool);
    return new PrismaClient({ adapter, log: [...log] });
  }

  return new PrismaClient({ log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
