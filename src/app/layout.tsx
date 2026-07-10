import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Lato } from "next/font/google";
import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import { getStrings } from "@/lib/i18n";
import GlobalLanguageToggle from "./GlobalLanguageToggle";
import "./globals.css";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GDI QBR OS",
  description: "Système de revue trimestrielle des affaires — GDI QBR OS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getServerUiLocale();
  const nav = getStrings(locale).nav;

  const links = [
    { href: "/dashboard", label: nav.dashboard },
    { href: "/qbr/new", label: nav.newQbr },
    { href: "/collaborate", label: nav.editor },
    { href: "/admin/settings", label: nav.settings },
  ];

  return (
    <html lang={locale} className={lato.variable} suppressHydrationWarning>
      <body className={`${lato.className} font-sans antialiased`} suppressHydrationWarning>
        <div className="min-h-screen">
          <header className="border-b border-gdi-blue/15 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
              <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
                <Image
                  src="/brand/gdi-logo.png"
                  alt="GDI"
                  width={132}
                  height={40}
                  className="h-9 w-auto"
                  priority
                />
                <span className="hidden text-sm font-semibold text-gdi-blue sm:inline">QBR OS</span>
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
              <div className="shrink-0">
                <GlobalLanguageToggle locale={locale} />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
