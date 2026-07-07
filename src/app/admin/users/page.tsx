"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { USER_ROLES } from "@/lib/constants";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", role: "Viewer" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setUsers(await fetch("/api/admin/users").then((r) => r.json()));
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!form.name || !form.email) return;
    setMessage(null);
    await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ name: "", email: "", role: "Viewer" });
    load();
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
      <h1 className="text-2xl font-bold">Users & Roles</h1>

      {message && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{message}</div>
      )}

      <Card>
        <CardHeader><CardTitle>Add / update user</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className="rounded-md border px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
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
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-2 font-medium">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">{u.role}</td>
                  <td className="p-2 text-right">
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
