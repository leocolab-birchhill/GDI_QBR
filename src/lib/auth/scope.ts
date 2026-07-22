import type { Prisma } from "@prisma/client";
import type { AuthUser } from "./identity";

/** Accounts the user may see: Admin = all; Viewer = none; others = ownership ∪ regions. */
export function accountScopeFilter(user: AuthUser): Prisma.AccountWhereInput {
  if (user.role === "Admin") return {};

  if (user.role === "Viewer") {
    return { id: { in: [] } };
  }

  const clauses: Prisma.AccountWhereInput[] = [];

  if (user.role === "VP") {
    clauses.push({ vpOwnerId: user.id });
  } else if (user.role === "Director") {
    clauses.push({ directorId: user.id });
  } else if (user.role === "AccountManager") {
    clauses.push({ accountManagerId: user.id });
  }

  if (
    user.regions.length > 0 &&
    (user.role === "VP" || user.role === "Director")
  ) {
    clauses.push({ region: { in: user.regions } });
  }

  if (clauses.length === 0) {
    return { id: { in: [] } };
  }

  return { OR: clauses };
}

/** QBR cycles scoped via their account. */
export function qbrScopeFilter(user: AuthUser): Prisma.QbrCycleWhereInput {
  if (user.role === "Admin") return {};
  return { account: accountScopeFilter(user) };
}

/** True when the given account id is inside the user's scope. */
export async function canAccessAccount(
  user: AuthUser,
  accountId: string,
  findFirst: (args: {
    where: Prisma.AccountWhereInput;
    select: { id: true };
  }) => Promise<{ id: string } | null>,
): Promise<boolean> {
  if (user.role === "Admin") return true;
  const row = await findFirst({
    where: { AND: [{ id: accountId }, accountScopeFilter(user)] },
    select: { id: true },
  });
  return Boolean(row);
}
