"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { USER_ROLES } from "@/lib/constants";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  regions?: string[];
};

function parseRegions(raw: string): string[] {
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Viewer",
    regions: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ role: "Viewer", regions: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!form.name || !form.email) return;
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        role: form.role,
        regions: parseRegions(form.regions),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Save failed");
      return;
    }
    setForm({ name: "", email: "", role: "Viewer", regions: "" });
    load();
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    setEdit({
      role: u.role,
      regions: (u.regions ?? []).join(", "),
    });
  }

  async function saveEdit(id: string) {
    setSavingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: edit.role,
          regions: parseRegions(edit.regions),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data.error === "string" ? data.error : "Update failed");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function remove(user: { id: string; name: string; email: string }) {
    const ok = window.confirm(
      `Delete ${user.name} (${user.email})?\n\nAccount role assignments (VP, Director, AM) will be cleared. This cannot be undone.`,
    );
    if (!ok) return;

    setDeletingId(user.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Delete failed");
        return;
      }
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users & Roles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign roles and regions so VPs/Directors only see BRs in their scope. Unknown SSO users
          auto-provision as Viewer until promoted here.
        </p>
      </div>

      {message && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{message}</div>
      )}

      <Card>
        <CardHeader><CardTitle>Add / update user</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="rounded-md border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Regions (e.g. Quebec, Ontario)"
            value={form.regions}
            onChange={(e) => setForm({ ...form, regions: e.target.value })}
            title="Comma-separated regions for VP/Director scope"
          />
          <Button onClick={create}>Save user</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All users</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Role</th>
                <th className="p-2">Regions</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t align-top">
                  <td className="p-2 font-medium">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">
                    {editingId === u.id ? (
                      <select
                        className="rounded-md border px-2 py-1 text-sm"
                        value={edit.role}
                        onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      u.role
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {editingId === u.id ? (
                      <input
                        className="w-full min-w-[10rem] rounded-md border px-2 py-1 text-sm"
                        value={edit.regions}
                        placeholder="Quebec, Ontario"
                        onChange={(e) => setEdit({ ...edit, regions: e.target.value })}
                      />
                    ) : (
                      (u.regions ?? []).length ? (u.regions ?? []).join(", ") : "—"
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {editingId === u.id ? (
                      <span className="inline-flex gap-2">
                        <Button size="sm" disabled={savingId === u.id} onClick={() => saveEdit(u.id)}>
                          {savingId === u.id ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === u.id}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => remove(u)}
                        >
                          {deletingId === u.id ? "Deleting…" : "Delete"}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="py-4 text-sm text-muted-foreground">No users yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
