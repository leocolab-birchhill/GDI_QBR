import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_ROLES, type UserRole } from "@/lib/constants";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  regions: string[];
};

function parseRole(role: string): UserRole {
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "Viewer";
}

function toAuthUser(row: {
  id: string;
  name: string;
  email: string;
  role: string;
  regions: string[];
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: parseRole(row.role),
    regions: row.regions ?? [],
  };
}

/**
 * Resolve email + display name from Databricks Apps forwarded headers,
 * with DEV_USER_EMAIL fallback for local development.
 */
export function readIdentityFromHeaders(headerBag: Headers): {
  email: string;
  name?: string;
} | null {
  const emailHeader = headerBag.get("x-forwarded-email")?.trim();
  const preferred = headerBag.get("x-forwarded-preferred-username")?.trim();
  const forwardedUser = headerBag.get("x-forwarded-user")?.trim();
  const devEmail = process.env.DEV_USER_EMAIL?.trim();

  const emailCandidate =
    (emailHeader && emailHeader.includes("@") ? emailHeader : null) ||
    (preferred && preferred.includes("@") ? preferred : null) ||
    (forwardedUser && forwardedUser.includes("@") ? forwardedUser : null) ||
    (devEmail && devEmail.includes("@") ? devEmail : null);

  if (!emailCandidate) return null;

  const name =
    preferred && !preferred.includes("@")
      ? preferred
      : headerBag.get("x-forwarded-preferred-username")?.trim() || undefined;

  return {
    email: emailCandidate.toLowerCase(),
    name: name || undefined,
  };
}

async function resolveOrProvisionUser(
  identity: { email: string; name?: string },
): Promise<AuthUser> {
  const existing = await prisma.user.findUnique({
    where: { email: identity.email },
  });
  if (existing) return toAuthUser(existing);

  const displayName =
    identity.name?.trim() ||
    identity.email.split("@")[0] ||
    identity.email;

  const created = await prisma.user.create({
    data: {
      email: identity.email,
      name: displayName,
      role: "Viewer",
      regions: [],
    },
  });
  return toAuthUser(created);
}

/** Look up (or auto-provision as Viewer) the current user from a Headers bag. */
export async function getCurrentUserFromHeaders(
  headerBag: Headers,
): Promise<AuthUser | null> {
  const identity = readIdentityFromHeaders(headerBag);
  if (!identity) return null;
  return resolveOrProvisionUser(identity);
}

/**
 * Server Component / Route Handler helper: identity from next/headers.
 * Cached per request via React.cache.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  return getCurrentUserFromHeaders(headers());
});

/** Convenience for Route Handlers that already have a Request. */
export async function getCurrentUserFromRequest(
  req: Request,
): Promise<AuthUser | null> {
  return getCurrentUserFromHeaders(req.headers);
}
