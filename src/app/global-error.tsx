"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", padding: "2rem", maxWidth: "32rem", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.75rem", color: "#555", fontSize: "0.875rem" }}>
          The app hit an unexpected error. Restart the dev server with{" "}
          <code style={{ background: "#f3f4f6", padding: "0 0.25rem" }}>npm run dev:reset</code> if
          this keeps happening.
        </p>
        {error.message && (
          <pre
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              background: "#f9fafb",
              fontSize: "0.75rem",
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1rem",
            background: "#1e3a5f",
            color: "white",
            border: "none",
            borderRadius: "0.375rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
