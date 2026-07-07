"use client";

import { useEffect, useState } from "react";
import { SAMPLE_PAYLOADS, SamplePayload } from "@/lib/samplePayloads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function EmailSimulatorPage() {
  const [form, setForm] = useState<SamplePayload>(SAMPLE_PAYLOADS[0]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [mailbox, setMailbox] = useState<string>("");

  useEffect(() => {
    fetch("/api/outlook/status")
      .then((r) => r.json())
      .then((s) => {
        if (s?.mailbox) {
          setMailbox(s.mailbox);
          setForm((f) => ({ ...f, toEmail: s.mailbox }));
        }
      })
      .catch(() => undefined);
  }, []);

  function pickSample(p: SamplePayload) {
    setForm({ ...p, toEmail: mailbox || p.toEmail });
  }

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/email/inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inbound Email Simulator</h1>
        <p className="text-muted-foreground">
          Simulate an email to <code className="rounded bg-muted px-1">qbr@gdi.com</code>. Drives the full
          classify → extract → DB → reply pipeline (works offline without an OpenAI key).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SAMPLE_PAYLOADS.map((p) => (
          <Button key={p.id} size="sm" variant="outline" onClick={() => pickSample(p)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="From (the person emailing the bot — the reply goes back here)"
              value={form.fromEmail}
              onChange={(v) => setForm({ ...form, fromEmail: v })}
            />
            <Field
              label="To (the QBR bot mailbox)"
              value={form.toEmail}
              onChange={(v) => setForm({ ...form, toEmail: v })}
            />
            {mailbox && (
              <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                ↩ The bot will reply <strong>from {mailbox}</strong> <strong>to {form.fromEmail || "the From address"}</strong>.
              </p>
            )}
            <Field label="Subject" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
            <div>
              <label className="mb-1 block text-sm font-medium">Body</label>
              <textarea
                className="h-44 w-full rounded-md border px-3 py-2 text-sm"
                value={form.bodyText}
                onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
              />
            </div>
            <Button onClick={send} disabled={busy}>
              {busy ? "Sending…" : "Send to /api/email/inbound"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3 text-sm">
                {result.qbrCycleId && (
                  <a className="text-primary underline" href={`/qbr/${result.qbrCycleId}`}>
                    Open QBR workspace →
                  </a>
                )}
                {result.reply && (
                  <div className="rounded-md border bg-accent p-3">
                    <div className="font-medium">Reply: {result.reply.subject}</div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-xs">{result.reply.text}</pre>
                  </div>
                )}
                {result.deck?.downloadUrl && (
                  <a
                    className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    href={result.deck.downloadUrl}
                  >
                    ⬇ Download {result.deck.fileName}
                  </a>
                )}
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Send an email to see the parsed result and auto-reply.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input className="w-full rounded-md border px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
