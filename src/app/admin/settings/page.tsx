"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const [graph, setGraph] = useState<any>(null);
  const [pollMsg, setPollMsg] = useState<string | null>(null);
  const [graphNotice, setGraphNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings").then((r) => r.json()).then(setS);
    fetch("/api/outlook/status").then((r) => r.json()).then(setGraph).catch(() => setGraph(null));
    const params = new URLSearchParams(window.location.search);
    if (params.get("graph_connected")) setGraphNotice({ type: "ok", text: "Mailbox connected successfully." });
    const err = params.get("graph_error");
    if (err) setGraphNotice({ type: "error", text: err });
  }, []);

  async function poll() {
    setPollMsg("Polling…");
    const res = await fetch("/api/outlook/poll", { method: "POST" });
    const data = await res.json();
    setPollMsg(res.ok ? `Processed ${data.count} message(s).` : `Error: ${data.error}`);
  }

  async function save() {
    setSaved(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    if (res.ok) {
      setS(await res.json());
      setSaved(true);
    }
  }

  if (!s) return <p className="text-muted-foreground">Loading…</p>;

  const placeholders = safeParse(s.dataSourcePlaceholdersJson, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Settings</h1>

      <Card>
        <CardHeader><CardTitle>Admin Tools</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <AdminToolLink
            href="/admin/accounts"
            title="Accounts"
            description="Manage client accounts, ownership, and account metadata."
          />
          <AdminToolLink
            href="/admin/users"
            title="Users"
            description="Manage app users and role assignments."
          />
          <AdminToolLink
            href="/api-test/jobs"
            title="Jobs"
            description="Run and inspect internal job/test utilities."
          />
          <AdminToolLink
            href="/api-test/email"
            title="Email Simulator"
            description="Internal simulator for testing inbound QBR email flows."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Microsoft Graph (real email)</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {graphNotice && (
            <div
              className={`rounded-md border px-3 py-2 ${
                graphNotice.type === "ok" ? "border-gdi-green/30 bg-gdi-green/5 text-gdi-green" : "border-gdi-red/30 bg-gdi-red/5 text-gdi-red"
              }`}
            >
              {graphNotice.type === "ok" ? "✓ " : "Connection error: "}
              {graphNotice.text}
            </div>
          )}
          {!graph ? (
            <p className="text-muted-foreground">Loading status…</p>
          ) : (
            <>
              <div className="grid gap-1">
                <div>Active provider: <strong>{graph.provider}</strong></div>
                <div>Credentials configured: <strong>{graph.configured ? "Yes" : "No"}</strong></div>
                <div>
                  Mailbox connected:{" "}
                  <strong className={graph.connected ? "text-gdi-green" : "text-amber-600"}>
                    {graph.connected ? `Yes — ${graph.email ?? "(unknown)"}` : "No"}
                  </strong>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href="/api/outlook/login">
                  <Button type="button">{graph.connected ? "Reconnect mailbox" : "Connect mailbox"}</Button>
                </a>
                <Button type="button" variant="outline" disabled={!graph.connected} onClick={poll}>
                  Poll inbox now
                </Button>
              </div>
              {pollMsg && <p className="text-muted-foreground">{pollMsg}</p>}
              {!graph.configured && (
                <p className="text-amber-600">
                  Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in your <code>.env</code>, then restart the dev server.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Email & Sender</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Shared mailbox" value={s.sharedMailbox} onChange={(v) => setS({ ...s, sharedMailbox: v })} />
          <Field label="Sender display name" value={s.senderDisplayName} onChange={(v) => setS({ ...s, senderDisplayName: v })} />
          <Field label="PowerPoint template path" value={s.pptTemplatePath ?? ""} onChange={(v) => setS({ ...s, pptTemplatePath: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Approval & Finalization</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Toggle label="Require VP approval before final deck" checked={s.requireVpApproval} onChange={(v) => setS({ ...s, requireVpApproval: v })} />
          <Toggle label="Allow finalization to override missing metrics" checked={s.allowFinalizeOverride} onChange={(v) => setS({ ...s, allowFinalizeOverride: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Data Source Placeholders</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {["finance", "tickets", "gdiInspect", "cleanCorrect", "contracts"].map((k) => (
            <Toggle
              key={k}
              label={k}
              checked={!!placeholders[k]}
              onChange={(v) => setS({ ...s, dataSourcePlaceholdersJson: JSON.stringify({ ...placeholders, [k]: v }) })}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Templates (JSON)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <JsonArea label="Reminder cadence" value={s.reminderCadenceJson} onChange={(v) => setS({ ...s, reminderCadenceJson: v })} />
          <JsonArea label="Client survey template" value={s.clientSurveyTemplateJson} onChange={(v) => setS({ ...s, clientSurveyTemplateJson: v })} />
          <JsonArea label="Internal sentiment survey template" value={s.internalSurveyTemplateJson} onChange={(v) => setS({ ...s, internalSurveyTemplateJson: v })} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save}>Save settings</Button>
        {saved && <span className="text-sm text-gdi-green">Saved.</span>}
      </div>
    </div>
  );
}

function AdminToolLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border bg-white p-4 transition hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function JsonArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <textarea className="h-24 w-full rounded-md border px-3 py-2 font-mono text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function safeParse(s: string, fallback: any) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
