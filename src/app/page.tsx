import { redirect } from "next/navigation";
import { getCurrentUser, hasCapability } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (user && hasCapability(user.role, "canViewDashboard")) {
    redirect("/dashboard");
  }
  redirect("/collaborate");
}
