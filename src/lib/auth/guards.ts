import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  getCurrentUser,
  getCurrentUserFromRequest,
  type AuthUser,
} from "./identity";
import { hasCapability, isAdmin, type Capability } from "./permissions";
import { accountScopeFilter, qbrScopeFilter } from "./scope";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export type QbrAccess = {
  user: AuthUser;
  qbrCycleId: string;
  accountId: string;
};

/** Server pages: require a signed-in Admin or redirect. */
export async function requireAdminPage(redirectTo = "/collaborate"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    redirect(redirectTo);
  }
  return user;
}

/** Server pages: require any signed-in user. */
export async function requireUserPage(redirectTo = "/collaborate"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(redirectTo);
  }
  return user;
}

/** API: require Admin. Returns NextResponse on failure, AuthUser on success. */
export async function requireAdminApi(
  req: Request,
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

/** API: require signed-in user. */
export async function requireUserApi(
  req: Request,
): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/** API: require a capability. */
export async function requireCapabilityApi(
  req: Request,
  capability: Capability,
): Promise<AuthUser | NextResponse> {
  const user = await requireUserApi(req);
  if (user instanceof NextResponse) return user;
  if (!hasCapability(user.role, capability)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export function isAuthUser(value: AuthUser | NextResponse): value is AuthUser {
  return !(value instanceof NextResponse);
}

export function isQbrAccess(value: QbrAccess | NextResponse): value is QbrAccess {
  return !(value instanceof NextResponse);
}

/** API: require signed-in user with scope (and optional capability) on a QBR cycle. */
export async function requireQbrAccessApi(
  req: Request,
  qbrCycleId: string,
  capability?: Capability,
): Promise<QbrAccess | NextResponse> {
  const user = capability
    ? await requireCapabilityApi(req, capability)
    : await requireUserApi(req);
  if (!isAuthUser(user)) return user;

  const qbr = await prisma.qbrCycle.findFirst({
    where: { id: qbrCycleId, AND: [qbrScopeFilter(user)] },
    select: { id: true, accountId: true },
  });
  if (!qbr) {
    const exists = await prisma.qbrCycle.findUnique({
      where: { id: qbrCycleId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user, qbrCycleId: qbr.id, accountId: qbr.accountId };
}

/** API: require signed-in user with scope (and optional capability) on an account. */
export async function requireAccountAccessApi(
  req: Request,
  accountId: string,
  capability?: Capability,
): Promise<{ user: AuthUser; accountId: string } | NextResponse> {
  const user = capability
    ? await requireCapabilityApi(req, capability)
    : await requireUserApi(req);
  if (!isAuthUser(user)) return user;

  const account = await prisma.account.findFirst({
    where: { id: accountId, AND: [accountScopeFilter(user)] },
    select: { id: true },
  });
  if (!account) {
    const exists = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { user, accountId: account.id };
}

/** Server pages: require scoped access to a QBR or redirect / 404. */
export async function requireQbrAccessPage(
  qbrCycleId: string,
  capability?: Capability,
): Promise<QbrAccess> {
  const user = await getCurrentUser();
  if (!user) redirect("/collaborate");
  if (capability && !hasCapability(user.role, capability)) {
    redirect("/collaborate");
  }

  const qbr = await prisma.qbrCycle.findFirst({
    where: { id: qbrCycleId, AND: [qbrScopeFilter(user)] },
    select: { id: true, accountId: true },
  });
  if (!qbr) {
    const exists = await prisma.qbrCycle.findUnique({
      where: { id: qbrCycleId },
      select: { id: true },
    });
    if (!exists) notFound();
    redirect("/collaborate");
  }

  return { user, qbrCycleId: qbr.id, accountId: qbr.accountId };
}
