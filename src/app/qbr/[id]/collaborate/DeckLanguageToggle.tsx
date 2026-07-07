"use client";

import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/i18n";

/** Toggle FR/EN for the rendered PowerPoint deck (separate from workflow UI language). */
export default function DeckLanguageToggle({
  deckLocale,
  uiLocale,
  busy,
  onChange,
}: {
  deckLocale: Locale;
  uiLocale: Locale;
  busy: boolean;
  onChange: (locale: Locale) => void;
}) {
  const dl = getStrings(uiLocale).editor.deckLanguage;

  return (
    <div className="mb-2 rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{dl.label}</p>
          <p className="text-[10px] text-muted-foreground">{dl.hint}</p>
        </div>
        <div
          className="flex shrink-0 rounded-md border bg-background p-0.5"
          role="group"
          aria-label={dl.label}
        >
          {(["fr", "en"] as const).map((loc) => (
            <button
              key={loc}
              type="button"
              disabled={busy}
              onClick={() => loc !== deckLocale && onChange(loc)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                deckLocale === loc
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {loc === "fr" ? dl.fr : dl.en}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
