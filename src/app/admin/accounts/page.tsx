"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    clientName: "",
    region: "",
    vpOwnerId: "",
    directorId: "",
    accountManagerId: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setAccounts(await fetch("/api/admin/accounts").then((r) => r.json()));
    setUsers(await fetch("/api/admin/users").then((r) => r.json()));
  }
  useEffect(() => {
    load();
  }, []);

  function startEdit(a: any) {
    setEditingId(a.id);
    setEditName(a.clientName);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;
    await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, clientName: name }),
    });
    setEditingId(null);
    setEditName("");
    load();
  }

  async function deleteAccount() {
    if (!deleteTarget || deleteConfirmName.trim() !== deleteTarget.clientName)
      return;
    setDeletingId(deleteTarget.id);
    setMessage("");
    const res = await fetch("/api/admin/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deleteTarget.id,
        confirmationName: deleteConfirmName.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setMessage(data.error ?? "Delete failed");
      return;
    }
    setDeleteTarget(null);
    setDeleteConfirmName("");
    setMessage(`Deleted ${deleteTarget.clientName}.`);
    load();
  }

  async function create() {
    if (!form.clientName) return;
    const body: any = {
      clientName: form.clientName,
      region: form.region || undefined,
    };
    for (const k of ["vpOwnerId", "directorId", "accountManagerId"] as const)
      if (form[k]) body[k] = form[k];
    await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setForm({
      clientName: "",
      region: "",
      vpOwnerId: "",
      directorId: "",
      accountManagerId: "",
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Accounts</h1>
      {message && (
        <p className="rounded-md border bg-card p-3 text-sm">{message}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Client name"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Region"
            value={form.region}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
          />
          <UserSelect
            label="VP"
            users={users}
            value={form.vpOwnerId}
            onChange={(v) => setForm({ ...form, vpOwnerId: v })}
          />
          <UserSelect
            label="Director"
            users={users}
            value={form.directorId}
            onChange={(v) => setForm({ ...form, directorId: v })}
          />
          <UserSelect
            label="Account Manager"
            users={users}
            value={form.accountManagerId}
            onChange={(v) => setForm({ ...form, accountManagerId: v })}
          />
          <Button onClick={create}>Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="p-2">Logo</th>
                <th className="p-2">Client</th>
                <th className="p-2">Region</th>
                <th className="p-2">VP</th>
                <th className="p-2">Director</th>
                <th className="p-2">AM</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">
                    <LogoCell account={a} onUploaded={load} />
                  </td>
                  <td className="p-2 font-medium">
                    {editingId === a.id ? (
                      <input
                        autoFocus
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(a.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                    ) : (
                      a.clientName
                    )}
                  </td>
                  <td className="p-2">{a.region || "—"}</td>
                  <td className="p-2">{a.vpOwner?.name || "—"}</td>
                  <td className="p-2">{a.director?.name || "—"}</td>
                  <td className="p-2">{a.accountManager?.name || "—"}</td>
                  <td className="p-2 text-right">
                    {editingId === a.id ? (
                      <span className="flex justify-end gap-2">
                        <Button onClick={() => saveEdit(a.id)}>Save</Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => startEdit(a)}>
                          Rename
                        </Button>
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setDeleteTarget(a);
                            setDeleteConfirmName("");
                            setMessage("");
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-red-700">
              Delete client
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This permanently deletes{" "}
              <strong>{deleteTarget.clientName}</strong> and its BR cycles,
              decks, messages, surveys, and related records. To confirm, type
              the exact client name.
            </p>
            <input
              autoFocus
              className="mt-4 w-full rounded-md border px-3 py-2 text-sm"
              placeholder={deleteTarget.clientName}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={deletingId === deleteTarget.id}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmName("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  deleteConfirmName.trim() !== deleteTarget.clientName ||
                  deletingId === deleteTarget.id
                }
                onClick={deleteAccount}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deletingId === deleteTarget.id ? "Deleting…" : "Delete client"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Per-account logo: shows the current logo (used on the QBR title-slide
 * co-branding lockup) and lets an admin upload/replace it. The image is saved to
 * the account profile so every deck for this client picks it up automatically.
 */
function LogoCell({
  account,
  onUploaded,
}: {
  account: any;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/clients/${account.id}/logo`, {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onUploaded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex h-10 w-20 items-center justify-center overflow-hidden rounded border bg-white">
        {account.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.logoUrl}
            alt={`${account.clientName} logo`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">No logo</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Uploading…" : account.logoUrl ? "Replace" : "Upload"}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}

function UserSelect({
  label,
  users,
  value,
  onChange,
}: {
  label: string;
  users: any[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="rounded-md border px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}…</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.role})
        </option>
      ))}
    </select>
  );
}
