import { PrismaClient } from "@prisma/client";

/**
 * Prints the stored Microsoft Graph refresh token to YOUR local terminal so you
 * can paste it into `.env` as GRAPH_REFRESH_TOKEN for set-and-forget auto-connect
 * (survives DB resets). Run: npm run graph:token
 *
 * Treat the output as a secret — do not paste it anywhere public.
 */
const prisma = new PrismaClient();

async function main() {
  const acct = await prisma.emailAccount.findUnique({ where: { id: "graph" } });
  if (!acct?.refreshToken) {
    console.log("No Graph connection found. Connect once at /api/outlook/login first.");
    return;
  }
  console.log("\nConnected mailbox:", acct.email ?? "(unknown)");
  console.log("\nAdd this line to your .env (keep it secret):\n");
  console.log(`GRAPH_REFRESH_TOKEN=${acct.refreshToken}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
