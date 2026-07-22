import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Lato } from "next/font/google";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import { getStrings } from "@/lib/i18n";
import { getCurrentUser, hasCapability } from "@/lib/auth";
import UserBadge from "@/components/UserBadge";
import GlobalLanguageToggle from "./GlobalLanguageToggle";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GDI BR Creation Agent",
  description: "Système de revue d’affaires — GDI BR Creation Agent",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getServerUiLocale();
  const nav = getStrings(locale).nav;
  const user = await getCurrentUser();
  const showDashboard = user ? hasCapability(user.role, "canViewDashboard") : false;
  const showSettings = user ? hasCapability(user.role, "canManageSettings") : false;

  const links = [
    ...(showDashboard ? [{ href: "/dashboard", label: nav.dashboard }] : []),
    { href: "/collaborate", label: nav.editor },
    ...(showSettings ? [{ href: "/admin/settings", label: nav.settings }] : []),
  ];

  return (
    <html lang={locale} className={lato.variable} suppressHydrationWarning>
      <body
        className={`${lato.className} font-sans antialiased`}
        suppressHydrationWarning
      >
        <div className="min-h-screen">
          <header className="border-b border-gdi-blue/15 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
              <Link
                href={showDashboard ? "/dashboard" : "/collaborate"}
                className="flex shrink-0 items-center gap-3"
              >
                <Image
                  src="/brand/gdi-logo.png"
                  alt="GDI"
                  width={132}
                  height={40}
                  className="h-8 w-auto"
                  priority
                />
                <span className="hidden text-sm font-semibold text-gdi-blue sm:inline">
                  BR Creation Agent
                </span>
              </Link>
              <nav className="flex flex-1 flex-wrap gap-1 text-sm">
                {links.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="flex shrink-0 items-center gap-3">
                <UserBadge user={user} />
                <GlobalLanguageToggle locale={locale} />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-3">{children}</main>
        </div>
      </body>
    </html>
  );
}
