"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getStrings, type Locale } from "@/lib/i18n";

const STORAGE_KEY = "gdi-qbr-editor-tour-v1";

type Rect = { top: number; left: number; width: number; height: number };

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function measureTarget(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return {
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
  };
}

export default function EditorTour({
  locale,
  forceOpen = false,
  onClose,
}: {
  locale: Locale;
  /** When true, reopen the tour even if previously dismissed. */
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const s = getStrings(locale).editor.tour;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (forceOpen) {
      setStep(0);
      setOpen(true);
      return;
    }
    if (!readDismissed()) setOpen(true);
  }, [forceOpen]);

  const current = s.steps[step];
  const isLast = step >= s.steps.length - 1;

  const refreshRect = useCallback(() => {
    if (!open || !current) {
      setRect(null);
      return;
    }
    setRect(measureTarget(current.target));
  }, [open, current]);

  useLayoutEffect(() => {
    refreshRect();
  }, [refreshRect, step]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => refreshRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const timer = window.setInterval(refreshRect, 400);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(timer);
    };
  }, [open, refreshRect]);

  function dismiss() {
    writeDismissed();
    setOpen(false);
    onClose?.();
  }

  if (!open || !current) return null;

  const pad = 8;
  const highlight = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const cardStyle = highlight
    ? {
        top: Math.min(
          highlight.top + highlight.height + 12,
          window.scrollY + window.innerHeight - 220,
        ),
        left: Math.max(
          16,
          Math.min(highlight.left, window.scrollX + window.innerWidth - 340),
        ),
      }
    : {
        top: window.scrollY + window.innerHeight / 2 - 80,
        left: window.scrollX + window.innerWidth / 2 - 160,
      };

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label={s.skip}
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={dismiss}
      />
      {highlight && (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.40)",
            background: "transparent",
          }}
        />
      )}
      <div
        className="absolute w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-background p-4 shadow-xl"
        style={cardStyle}
        role="dialog"
        aria-labelledby="editor-tour-title"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {step + 1} / {s.steps.length}
        </p>
        <h3 id="editor-tour-title" className="mt-1 text-sm font-semibold text-foreground">
          {current.title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{current.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {s.skip}
          </button>
          <div className="flex items-center gap-1.5">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((v) => Math.max(0, v - 1))}
                className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
              >
                {s.back}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) dismiss();
                else setStep((v) => v + 1);
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {isLast ? s.done : s.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
