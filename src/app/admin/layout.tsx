import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** All /admin/* pages are Admin-only. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage("/collaborate");
  return children;
}
