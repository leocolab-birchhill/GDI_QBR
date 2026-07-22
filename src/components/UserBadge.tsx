import type { AuthUser } from "@/lib/auth";

export default function UserBadge({ user }: { user: AuthUser | null }) {
  if (!user) {
    return (
      <span className="hidden text-[11px] text-muted-foreground sm:inline">
        No identity
      </span>
    );
  }

  return (
    <div className="flex max-w-[14rem] items-center gap-2 text-xs">
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate font-medium text-foreground">{user.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
      </div>
      <span className="shrink-0 rounded-md border border-gdi-blue/20 bg-gdi-blue/5 px-1.5 py-0.5 text-[10px] font-semibold text-gdi-blue">
        {user.role}
      </span>
    </div>
  );
}
