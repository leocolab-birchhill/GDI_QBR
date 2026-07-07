"use client";

import { useEffect, useRef, useState } from "react";
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

type Account = { id: string; clientName: string; logoUrl?: string | null; language?: string };
type Cycle = {
  id: string;
  quarter: string;
  year: number;
  status: string;
  updatedAt: string;
  latestDeckVersion: number | null;
  editorUrl: string;
};
type Step = "choose" | "newClient" | "select" | "action" | "logo";

/**
 * Collaborative editor entry point. Walks the user through selecting/creating a
 * client, choosing whether to open the last saved QBR or start a fresh one, and
 * (optionally) uploading the client logo BEFORE the editor opens on the title
 * slide. The logo is saved to the client profile and used in the co-branding
 * lockup on every slide. Site language comes from the global header switch.
 */
export default function CollaborateWizard({ locale }: { locale: Locale }) {
  const router = useRouter();
  const s = getStrings(locale);
  const w = s.create.wizard;

  const [step, setStep] = useState<Step>("choose");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // New-client form.
  const [newClient, setNewClient] = useState({
    clientName: "",
    quarter: currentQuarter(),
    year: String(new Date().getFullYear()),
    language: locale as Locale,
  });

  // Existing-client selection.
  const [selectedId, setSelectedId] = useState("");
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [action, setAction] = useState<"open" | "fresh">("fresh");
  // Quarter/year chosen for a fresh QBR (existing-client flow).
  const [freshQuarter, setFreshQuarter] = useState<string>(currentQuarter());
  const [freshYear, setFreshYear] = useState<number>(new Date().getFullYear());

  // Logo step (shared by both flows).
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const selectedAccount = accounts.find((a) => a.id === selectedId) ?? null;
  const lastCycle = cycles[0] ?? null;
  // The existing cycle (if any) for the quarter/year the user picked for a fresh QBR.
  const existingForSelection = cycles.find((c) => c.quarter === freshQuarter && c.year === freshYear) ?? null;
  // A fresh QBR for the chosen quarter is blocked when one already exists there.
  const freshBlocked = action === "fresh" && existingForSelection != null;
  const yearOptions = (() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  })();

  function reset() {
    setStep("choose");
    setError("");
    setLogoFile(null);
    setLogoPreview("");
  }

  function pickLogo(file: File) {
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function loadCycles(accountId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${accountId}/qbr`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const list: Cycle[] = data.cycles ?? [];
      setCycles(list);
      setAction(list.length > 0 ? "open" : "fresh");
      setStep("action");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogoTo(accountId: string) {
    if (!logoFile) return;
    const body = new FormData();
    body.append("file", logoFile);
    const res = await fetch(`/api/clients/${accountId}/logo`, { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Logo upload failed");
    }
  }

  /** Final "Continue" from the logo step — runs the chosen flow then redirects. */
  async function finish() {
    setBusy(true);
    setError("");
    try {
      if (selectedAccount) {
        // A fresh QBR for an already-used quarter would duplicate it — open the
        // existing one instead of creating a duplicate.
        if (action === "fresh" && existingForSelection) {
          router.push(existingForSelection.editorUrl);
          return;
        }
        // Existing client: upload the logo (if any), then open or create.
        await uploadLogoTo(selectedAccount.id);
        if (action === "open" && lastCycle) {
          router.push(lastCycle.editorUrl);
          return;
        }
        const res = await fetch(`/api/clients/${selectedAccount.id}/qbr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: selectedAccount.language, quarter: freshQuarter, year: freshYear }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? s.create.error);
        router.push(data.editorUrl);
      } else {
        // New client: create the account + blank QBR, then attach the logo.
        const res = await fetch("/api/clients/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: newClient.clientName.trim(),
            quarter: newClient.quarter,
            year: Number(newClient.year),
            language: newClient.language,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? s.create.error);
        if (logoFile && data.account?.id) await uploadLogoTo(data.account.id);
        router.push(data.editorUrl);
      }
    } catch (err) {
      setError((err as Error).message || s.create.error);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{w.heading}</h1>
        <p className="text-sm text-muted-foreground">{w.subtitle}</p>
      </div>

      {/* Step 1 — choose flow */}
      {step === "choose" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelectedId("");
              setStep("newClient");
            }}
            className="rounded-lg border-2 border-primary/20 p-6 text-left transition hover:border-primary hover:bg-accent"
          >
            <div className="text-base font-semibold">{w.newClientCta}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.create.subtitle}</p>
          </button>
          <button
            type="button"
            onClick={() => setStep("select")}
            className="rounded-lg border-2 border-primary/20 p-6 text-left transition hover:border-primary hover:bg-accent"
          >
            <div className="text-base font-semibold">{w.selectClientCta}</div>
            <p className="mt-1 text-sm text-muted-foreground">{w.chooseClientHint}</p>
          </button>
        </div>
      )}

      {/* Step 2a — new client details */}
      {step === "newClient" && (
        <Card>
          <CardHeader>
            <CardTitle>{w.newClientCta}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-1 text-sm">
              {s.create.clientName}
              <input
                autoFocus
                className="rounded-md border px-3 py-2"
                value={newClient.clientName}
                onChange={(e) => setNewClient({ ...newClient, clientName: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                {s.create.quarter}
                <select
                  className="rounded-md border px-3 py-2"
                  value={newClient.quarter}
                  onChange={(e) => setNewClient({ ...newClient, quarter: e.target.value })}
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
                  value={newClient.year}
                  onChange={(e) => setNewClient({ ...newClient, year: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                {s.create.language}
                <select
                  className="rounded-md border px-3 py-2"
                  value={newClient.language}
                  onChange={(e) => setNewClient({ ...newClient, language: e.target.value as Locale })}
                >
                  <option value="fr">{s.create.languageFr}</option>
                  <option value="en">{s.create.languageEn}</option>
                </select>
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>{w.back}</Button>
              <Button
                disabled={!newClient.clientName.trim()}
                onClick={() => {
                  setError("");
                  setStep("logo");
                }}
              >
                {w.continue}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2b — select existing client */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>{w.chooseClient}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-1 text-sm">
              {w.chooseClientHint}
              <select
                className="rounded-md border px-3 py-2"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">{s.create.selectClient}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.clientName}</option>
                ))}
              </select>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>{w.back}</Button>
              <Button disabled={!selectedId || busy} onClick={() => loadCycles(selectedId)}>
                {busy ? "…" : w.continue}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — existing client: open last saved or generate fresh */}
      {step === "action" && selectedAccount && (
        <Card>
          <CardHeader>
            <CardTitle>{w.actionTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {lastCycle ? (
              <button
                type="button"
                onClick={() => setAction("open")}
                className={`rounded-lg border-2 p-4 text-left transition ${action === "open" ? "border-primary bg-accent" : "border-primary/15 hover:border-primary/40"}`}
              >
                <div className="font-semibold">{w.openLastSaved}</div>
                <p className="text-sm text-muted-foreground">
                  {w.openLastSavedHint(lastCycle.quarter, lastCycle.year, lastCycle.latestDeckVersion)}
                </p>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">{w.noSavedQbr}</p>
            )}
            <button
              type="button"
              onClick={() => setAction("fresh")}
              className={`rounded-lg border-2 p-4 text-left transition ${action === "fresh" ? "border-primary bg-accent" : "border-primary/15 hover:border-primary/40"}`}
            >
              <div className="font-semibold">{w.generateFresh}</div>
              <p className="text-sm text-muted-foreground">{w.generateFreshHint}</p>
            </button>

            {action === "fresh" && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="mb-2 text-sm font-medium">{w.freshQuarterLabel}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    {s.create.quarter}
                    <select
                      className="rounded-md border px-3 py-2"
                      value={freshQuarter}
                      onChange={(e) => setFreshQuarter(e.target.value)}
                    >
                      {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    {s.create.year}
                    <select
                      className="rounded-md border px-3 py-2"
                      value={freshYear}
                      onChange={(e) => setFreshYear(Number(e.target.value))}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {existingForSelection ? (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">
                      {w.quarterTaken(selectedAccount.clientName, freshQuarter, freshYear)}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => router.push(existingForSelection.editorUrl)}
                    >
                      {w.openExisting}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">{w.quarterAvailable(freshQuarter, freshYear)}</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("select")}>{w.back}</Button>
              <Button disabled={freshBlocked} onClick={() => setStep("logo")}>{w.continue}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — logo upload (first request, before the title slide) */}
      {step === "logo" && (
        <Card>
          <CardHeader>
            <CardTitle>{w.logoTitle}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm text-muted-foreground">{w.logoHint}</p>

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded border bg-white">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="logo preview" className="max-h-full max-w-full object-contain" />
                ) : selectedAccount?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedAccount.logoUrl} alt="current logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">{s.create.logo}</span>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickLogo(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>{w.chooseFile}</Button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(selectedAccount ? "action" : "newClient")}
              >
                {w.back}
              </Button>
              <div className="flex gap-2">
                {!logoFile && (
                  <Button variant="outline" disabled={busy} onClick={finish}>
                    {busy ? w.opening : w.skip}
                  </Button>
                )}
                <Button disabled={busy} onClick={finish}>
                  {busy ? w.opening : w.continue}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
