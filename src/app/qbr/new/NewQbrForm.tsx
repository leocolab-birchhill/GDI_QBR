"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, getStrings, type Locale } from "@/lib/i18n";

function currentQuarter(): string {
  const m = new Date().getMonth();
  if (m < 3) return "Q1";
  if (m < 6) return "Q2";
  if (m < 9) return "Q3";
  return "Q4";
}

/**
 * New-client / new-QBR form. The site language is controlled globally by the
 * header language switch (passed in as `locale`); this page has no toggle of
 * its own. The deck render language is chosen separately per client.
 */
export default function NewQbrForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const s = getStrings(locale);

  const [accounts, setAccounts] = useState<{ id: string; clientName: string; language?: string }[]>([]);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    clientName: "",
    quarter: currentQuarter(),
    year: String(new Date().getFullYear()),
    meetingDate: "",
    stakeholderEmails: "",
    logoUrl: "",
    metadata: "",
    accountId: "",
    language: locale as Locale,
  });

  useEffect(() => {
    fetch("/api/admin/accounts")
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let res: Response;
      if (mode === "existing" && form.accountId) {
        res = await fetch(`/api/clients/${form.accountId}/qbr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quarter: form.quarter,
            year: Number(form.year),
            meetingDate: form.meetingDate || undefined,
            language: form.language,
          }),
        });
      } else {
        if (!form.clientName.trim()) {
          setError(s.create.error);
          setBusy(false);
          return;
        }
        res = await fetch("/api/clients/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: form.clientName.trim(),
            quarter: form.quarter,
            year: Number(form.year),
            meetingDate: form.meetingDate || undefined,
            language: form.language,
            logoUrl: form.logoUrl || undefined,
            stakeholderEmails: form.stakeholderEmails
              ? form.stakeholderEmails.split(",").map((e) => e.trim()).filter(Boolean)
              : undefined,
            metadata: form.metadata ? { notes: form.metadata } : undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      router.push(data.editorUrl);
    } catch (err) {
      setError((err as Error).message || s.create.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{s.create.title}</h1>
        <p className="text-sm text-muted-foreground">{s.create.subtitle}</p>
      </div>

      <div className="flex gap-2">
        <Button variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
          {s.create.createNewClient}
        </Button>
        <Button variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
          {s.create.existingClient}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "new" ? s.create.createNewClient : s.create.newBlankQbr}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            {mode === "existing" ? (
              <label className="grid gap-1 text-sm">
                {s.create.existingClient}
                <select
                  className="rounded-md border px-3 py-2"
                  value={form.accountId}
                  onChange={(e) => {
                    const acc = accounts.find((a) => a.id === e.target.value);
                    setForm({
                      ...form,
                      accountId: e.target.value,
                      language: (acc?.language as Locale) ?? DEFAULT_LOCALE,
                    });
                  }}
                  required
                >
                  <option value="">{s.create.selectClient}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.clientName}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="grid gap-1 text-sm">
                  {s.create.clientName}
                  <input
                    className="rounded-md border px-3 py-2"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    required
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {s.create.logo}
                  <input
                    className="rounded-md border px-3 py-2"
                    placeholder="https://…"
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {s.create.owners}
                  <span className="text-xs text-muted-foreground">{s.create.ownersHint}</span>
                  <input
                    className="rounded-md border px-3 py-2"
                    value={form.stakeholderEmails}
                    onChange={(e) => setForm({ ...form, stakeholderEmails: e.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  {s.create.metadata}
                  <span className="text-xs text-muted-foreground">{s.create.metadataHint}</span>
                  <textarea
                    className="rounded-md border px-3 py-2"
                    rows={2}
                    value={form.metadata}
                    onChange={(e) => setForm({ ...form, metadata: e.target.value })}
                  />
                </label>
              </>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                {s.create.quarter}
                <select
                  className="rounded-md border px-3 py-2"
                  value={form.quarter}
                  onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                >
                  {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                {s.create.year}
                <input
                  className="rounded-md border px-3 py-2"
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                {s.create.targetDate}
                <input
                  className="rounded-md border px-3 py-2"
                  type="date"
                  value={form.meetingDate}
                  onChange={(e) => setForm({ ...form, meetingDate: e.target.value })}
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              {s.create.language}
              <select
                className="rounded-md border px-3 py-2"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value as Locale })}
              >
                <option value="fr">{s.create.languageFr}</option>
                <option value="en">{s.create.languageEn}</option>
              </select>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" disabled={busy}>
              {busy ? "…" : s.create.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
