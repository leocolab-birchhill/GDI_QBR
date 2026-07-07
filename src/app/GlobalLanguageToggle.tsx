"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { getStrings, type Locale } from "@/lib/i18n";

const COOKIE = "uiLocale";

/**
 * Site-wide language switch shown in the global header. Persists the choice in a
 * cookie and refreshes server components so every localized page re-renders in
 * the selected language. This is the SITE/UI language — the deck language has its
 * own separate toggle on the editor preview.
 */
export default function GlobalLanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = getStrings(locale).nav.language;

  function choose(next: Locale) {
    if (next === locale || pending) return;
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{label}</span>
      <div
        className="flex rounded-md border border-gdi-blue/20 bg-white p-0.5"
        role="group"
        aria-label={label}
      >
        {(["fr", "en"] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            disabled={pending}
            onClick={() => choose(loc)}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
              locale === loc
                ? "bg-gdi-blue text-white shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {loc === "fr" ? "FR" : "EN"}
          </button>
        ))}
      </div>
    </div>
  );
}
