import type { UserRole } from "@/lib/constants";

export type Capability =
  | "canViewDashboard"
  | "canManageUsers"
  | "canManageSettings"
  | "canEditDeck"
  | "canApprove"
  | "canFinalize";

const ALL_CAPS: Record<Capability, boolean> = {
  canViewDashboard: true,
  canManageUsers: true,
  canManageSettings: true,
  canEditDeck: true,
  canApprove: true,
  canFinalize: true,
};

const NONE_CAPS: Record<Capability, boolean> = {
  canViewDashboard: false,
  canManageUsers: false,
  canManageSettings: false,
  canEditDeck: false,
  canApprove: false,
  canFinalize: false,
};

/** Role → capability matrix (code-seeded; AppSettings.rolePermissionsJson can override later). */
export const ROLE_PERMISSIONS: Record<UserRole, Record<Capability, boolean>> = {
  Admin: { ...ALL_CAPS },
  VP: {
    canViewDashboard: false,
    canManageUsers: false,
    canManageSettings: false,
    canEditDeck: true,
    canApprove: true,
    canFinalize: true,
  },
  Director: {
    canViewDashboard: false,
    canManageUsers: false,
    canManageSettings: false,
    canEditDeck: true,
    canApprove: false,
    canFinalize: false,
  },
  AccountManager: {
    canViewDashboard: false,
    canManageUsers: false,
    canManageSettings: false,
    canEditDeck: true,
    canApprove: false,
    canFinalize: false,
  },
  Viewer: { ...NONE_CAPS },
};

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return ROLE_PERMISSIONS[role]?.[capability] ?? false;
}

export function isAdmin(role: UserRole): boolean {
  return role === "Admin";
}
