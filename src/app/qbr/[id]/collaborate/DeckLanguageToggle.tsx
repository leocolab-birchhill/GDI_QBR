"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n";
import { getStrings } from "@/lib/i18n";

/** Compact FR/EN picker for the rendered PowerPoint deck (separate from workflow UI language). */
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
  const [open, setOpen] = useState(false);
  const currentLabel = deckLocale === "fr" ? dl.fr : dl.en;

  function choose(locale: Locale) {
    setOpen(false);
    if (locale !== deckLocale) onChange(locale);
  }

  return (
    <div className="relative mb-2 inline-block text-xs">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 font-medium text-foreground shadow-sm hover:bg-accent disabled:opacity-50"
        title={`${dl.label}: ${currentLabel}`}
        aria-label={`${dl.label}: ${currentLabel}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">🌐</span>
        <span>{deckLocale.toUpperCase()}</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={uiLocale === "fr" ? "Fermer le choix de langue" : "Close language picker"}
            className="fixed inset-0 z-[90] cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-[100] mt-2 w-64 rounded-lg border bg-white p-3 text-slate-950 shadow-xl ring-1 ring-black/10 dark:bg-slate-950 dark:text-slate-50">
            <p className="text-xs font-semibold">{dl.label}</p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{dl.hint}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={dl.label}>
              {(["fr", "en"] as const).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(loc)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    deckLocale === loc
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-accent"
                  }`}
                >
                  {loc === "fr" ? dl.fr : dl.en}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
