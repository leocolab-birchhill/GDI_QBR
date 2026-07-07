"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-card p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold text-gdi-blue">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The page failed to load. This often happens when the dev server build cache is stale — try
        restarting with <code className="rounded bg-muted px-1">npm run dev:reset</code>.
      </p>
      {error.message && (
        <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground">
          {error.message}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
