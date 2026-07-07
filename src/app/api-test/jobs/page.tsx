"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const JOBS = [
  { id: "monthlyCheckIn", label: "Monthly check-in" },
  { id: "director60", label: "60-day director reminder" },
  { id: "metrics45", label: "45-day metrics reminder" },
  { id: "vpSummary30", label: "30-day VP summary" },
  { id: "draft14", label: "14-day draft reminder" },
  { id: "finalReview", label: "Final review reminder" },
  { id: "postQbrSurveys", label: "Post-QBR surveys" },
  { id: "rollForward", label: "Roll forward to next QBR" },
];

export default function JobsPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/qbr")
      .then((r) => r.json())
      .then((data) => {
        setCycles(data);
        if (data[0]) setSelected(data[0].id);
      });
  }, []);

  async function run(job: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job, qbrCycleId: selected }),
      });
      const data = await res.json();
      setLog((l) => [`${new Date().toLocaleTimeString()} · ${job}: ${res.ok ? "OK" : "ERR"} ${JSON.stringify(data).slice(0, 120)}`, ...l]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Job / Reminder Runner</h1>
        <p className="text-muted-foreground">Manually trigger reminder-engine jobs. These are cron-ready.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Target QBR</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName} — {c.quarter} {c.year} ({c.status})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {JOBS.map((j) => (
          <Button key={j.id} variant="outline" disabled={busy || !selected} onClick={() => run(j.id)}>
            {j.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs run yet. Check the server console for mock email output.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {log.map((l, i) => (
                <li key={i} className="font-mono">{l}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
