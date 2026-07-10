"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TABS = [
  "Overview",
  "Follow-Ups",
  "Priority Items",
  "Dashboard",
  "What's Next",
  "Missing Info",
  "Deck Versions",
  "Emails",
  "Approvals",
  "Surveys",
] as const;

type Tab = (typeof TABS)[number];

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function QbrWorkspace({ qbr }: { qbr: any }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function call(label: string, url: string, body?: unknown) {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`${label} failed: ${data.error ?? res.statusText}`);
      } else {
        setMessage(`${label}: ${summarize(data)}`);
        router.refresh();
      }
    } catch (e) {
      setMessage(`${label} error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const id = qbr.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {qbr.account.clientName} — {qbr.quarter} {qbr.year}
          </h1>
          <p className="text-sm text-muted-foreground">
            VP: {qbr.account.vpOwner?.name ?? "—"} · Director:{" "}
            {qbr.account.director?.name ?? "—"} · AM:{" "}
            {qbr.account.accountManager?.name ?? "—"} · Meeting{" "}
            {fmt(qbr.meetingDate)}
          </p>
        </div>
        <Badge status={qbr.status}>{qbr.status.replace(/_/g, " ")}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!!busy}
          onClick={() =>
            call("Generate draft", `/api/qbr/${id}/generate-draft`)
          }
        >
          Generate Draft
        </Button>
        <Link
          href={`/qbr/${id}/collaborate`}
          className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Open Deck Editor
        </Link>
        <Button
          size="sm"
          variant="secondary"
          disabled={!!busy}
          onClick={() =>
            call("VP approve", `/api/qbr/${id}/approve`, {
              approverEmail: qbr.account.vpOwner?.email ?? "bruno@gdi.com",
              status: "approved",
            })
          }
        >
          Record VP Approval
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!!busy}
          onClick={() => call("Finalize", `/api/qbr/${id}/finalize`, {})}
        >
          Finalize
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            call("VP summary", `/api/qbr/${id}/send-reminder`, { type: "vp30" })
          }
        >
          Send 30-day VP Summary
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            call("Monthly check-in", `/api/qbr/${id}/send-reminder`, {
              type: "monthly",
            })
          }
        >
          Send Monthly Check-in
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => call("Surveys", `/api/qbr/${id}/survey/send`)}
        >
          Send Post-BR Surveys
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() =>
            call("Roll forward", `/api/jobs/run`, {
              job: "rollForward",
              qbrCycleId: id,
            })
          }
        >
          Roll Forward
        </Button>
      </div>

      {message && (
        <div className="rounded-md border bg-accent px-4 py-2 text-sm text-accent-foreground">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div>{renderTab(tab, qbr)}</div>
    </div>
  );
}

function summarize(data: any): string {
  if (data.fileName)
    return `${data.fileName}${data.unconfirmed?.length ? ` · unconfirmed: ${data.unconfirmed.join(", ")}` : ""}`;
  if (data.ok) return "done";
  return JSON.stringify(data).slice(0, 140);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function renderTab(tab: Tab, qbr: any) {
  switch (tab) {
    case "Overview":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Summary">
            <ul className="space-y-1 text-sm">
              <li>
                Status: <strong>{qbr.status.replace(/_/g, " ")}</strong>
              </li>
              <li>Follow-ups: {qbr.commitments.length}</li>
              <li>Priority items: {qbr.priorityItems.length}</li>
              <li>Metrics: {qbr.dashboardMetrics.length}</li>
              <li>Upcoming: {qbr.upcomingItems.length}</li>
              <li>
                Open missing info:{" "}
                {
                  qbr.missingInfoRequests.filter(
                    (m: any) => m.status === "Open",
                  ).length
                }
              </li>
              <li>Deck versions: {qbr.deckVersions.length}</li>
              <li>
                VP approved:{" "}
                {qbr.approvals.some((a: any) => a.status === "approved")
                  ? "Yes"
                  : "No"}
              </li>
            </ul>
          </Section>
          <Section title="Previous BR notes">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {qbr.previousQbrNotes || "—"}
            </p>
          </Section>
        </div>
      );
    case "Follow-Ups":
      return (
        <Section title="Open Follow-Ups & Progress">
          <Table
            head={[
              "#",
              "Agreed action (client-ready)",
              "Status",
              "Owner",
              "Due",
            ]}
          >
            {qbr.commitments.map((c: any, i: number) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">{c.clientReadyText || c.action}</td>
                <td className="p-2">{c.status}</td>
                <td className="p-2">{c.owner || "—"}</td>
                <td className="p-2">{fmt(c.dueDate)}</td>
              </tr>
            ))}
          </Table>
        </Section>
      );
    case "Priority Items":
      return (
        <div className="space-y-3">
          {qbr.priorityItems.map((p: any, i: number) => (
            <Section key={p.id} title={`${i + 1}. ${p.title}`}>
              <p className="text-sm">{p.clientReadyText}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Raw: {p.rawInput}
              </p>
              <p className="mt-1 text-xs">
                Category: {p.category || "—"}{" "}
                {p.needsDecision ? "· Needs decision" : ""}
              </p>
            </Section>
          ))}
          {qbr.priorityItems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No priority items yet.
            </p>
          )}
        </div>
      );
    case "Dashboard":
      return (
        <div className="grid gap-4 md:grid-cols-3">
          {["Health & Safety", "Operational", "Financial"].map((g) => (
            <Section key={g} title={g}>
              <ul className="space-y-1 text-sm">
                {qbr.dashboardMetrics
                  .filter((m: any) => m.group === g)
                  .map((m: any) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{m.label}</span>
                      <span
                        className={
                          m.isConfirmed ? "font-semibold" : "text-amber-600"
                        }
                      >
                        {m.value}
                      </span>
                    </li>
                  ))}
                {qbr.dashboardMetrics.filter((m: any) => m.group === g)
                  .length === 0 && (
                  <li className="text-muted-foreground">No metrics</li>
                )}
              </ul>
            </Section>
          ))}
        </div>
      );
    case "What's Next":
      return (
        <div className="space-y-3">
          {qbr.upcomingItems.map((u: any, i: number) => (
            <Section key={u.id} title={`${i + 1}. ${u.title}`}>
              <p className="text-sm">{u.clientReadyText}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Timing: {u.timing || "—"}
              </p>
            </Section>
          ))}
          {qbr.upcomingItems.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No upcoming items yet.
            </p>
          )}
        </div>
      );
    case "Missing Info":
      return (
        <Section title="Missing Info Requests">
          <Table head={["Field", "Question", "Assigned to", "Status"]}>
            {qbr.missingInfoRequests.map((m: any) => (
              <tr key={m.id} className="border-t">
                <td className="p-2">{m.field}</td>
                <td className="p-2">{m.question}</td>
                <td className="p-2">{m.assignedToEmail || "—"}</td>
                <td className="p-2">{m.status}</td>
              </tr>
            ))}
          </Table>
        </Section>
      );
    case "Deck Versions":
      return (
        <Section title="Deck Versions">
          <Table head={["Version", "Status", "Created", "Download"]}>
            {qbr.deckVersions.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-2">v{d.versionNumber}</td>
                <td className="p-2">{d.status}</td>
                <td className="p-2">{fmt(d.createdAt)}</td>
                <td className="p-2">
                  {d.fileUrl ? (
                    <a className="text-primary underline" href={d.fileUrl}>
                      Download .pptx
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {qbr.deckVersions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No decks generated yet.
            </p>
          )}
        </Section>
      );
    case "Emails":
      return (
        <div className="space-y-3">
          {qbr.emailThreads.flatMap((t: any) => t.messages).length === 0 && (
            <p className="text-sm text-muted-foreground">No emails yet.</p>
          )}
          {qbr.emailThreads.map((t: any) =>
            t.messages.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="py-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {m.direction === "inbound" ? "↓ Inbound" : "↑ Outbound"} ·{" "}
                      {m.fromEmail} → {m.toEmail}
                    </span>
                    <span>{fmt(m.receivedAt)}</span>
                  </div>
                  <div className="font-medium">{m.subject}</div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {m.bodyText}
                  </p>
                </CardContent>
              </Card>
            )),
          )}
        </div>
      );
    case "Approvals":
      return (
        <Section title="Approvals">
          <Table head={["Approver", "Status", "Comments", "When"]}>
            {qbr.approvals.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.approverEmail}</td>
                <td className="p-2">{a.status}</td>
                <td className="p-2">{a.comments || "—"}</td>
                <td className="p-2">{fmt(a.createdAt)}</td>
              </tr>
            ))}
          </Table>
          {qbr.approvals.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No approvals yet. VP approval is required before finalization.
            </p>
          )}
        </Section>
      );
    case "Surveys":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Client Surveys">
            {qbr.clientSurveys.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              qbr.clientSurveys.map((s: any) => (
                <div key={s.id} className="text-sm">
                  Overall: {s.overallScore ?? "—"} · {s.comments}
                </div>
              ))
            )}
          </Section>
          <Section title="Internal Sentiment">
            {qbr.internalSurveys.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              qbr.internalSurveys.map((s: any) => (
                <div key={s.id} className="text-sm">
                  Perceived: {s.perceivedClientScore ?? "—"} · {s.notes}
                </div>
              ))
            )}
          </Section>
        </div>
      );
  }
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs uppercase text-muted-foreground">
          {head.map((h) => (
            <th key={h} className="p-2">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
