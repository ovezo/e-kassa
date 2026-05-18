"use client";

import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useState } from "react";
import { Role } from "@prisma/client";
import { unikassaInvoke } from "@/lib/electron-api";
import { readSession } from "@/lib/session";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { NumberPad } from "@/components/NumberPad";

type UserRow = {
  id: string;
  login: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

const btn =
  "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50";
const input =
  "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-stone-400";

export default function AdminUsersPage() {
  const actorId = readSession()?.id;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changingPasswordUser, setChangingPasswordUser] = useState<UserRow | null>(null);
  const [showAddPasswordModal, setShowAddPasswordModal] = useState(false);

  const [form, setForm] = useState({
    login: "",
    password: "",
    displayName: "",
    role: Role.STAFF as Role,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await unikassaInvoke<UserRow[]>("users.list");
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 3) {
      setError("Password must be at least 3 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await unikassaInvoke<{ ok: boolean; error?: string }>(
        "users.create",
        { ...form, actorUserId: actorId },
      );
      if (!res.ok) {
        setError(res.error ?? "Create failed");
        return;
      }
      setForm({ login: "", password: "", displayName: "", role: Role.STAFF });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await unikassaInvoke<{ ok: boolean; error?: string }>(
        "users.update",
        { id: u.id, active: !u.active, actorUserId: actorId },
      );
      if (!res.ok) setError(res.error ?? "Update failed");
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: UserRow) {
    if (!confirm(`Delete user ${u.login}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await unikassaInvoke<{ ok: boolean; error?: string }>(
        "users.delete",
        { id: u.id, actorUserId: actorId },
      );
      if (!res.ok) setError(res.error ?? "Delete failed");
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Users" backHref="/admin/dashboard" />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-stone-800">Add user</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={createUser}>
          <div>
            <label className="text-xs font-medium text-stone-600" htmlFor="nu-login">
              Login
            </label>
            <input
              id="nu-login"
              className={input}
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600 mb-2 block">
              Password
            </label>
            <div className="flex items-center gap-3">
              <input
                type="password"
                className={`${input} mt-0 flex-1`}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                disabled={busy}
              />
              <button
                type="button"
                className={btn}
                onClick={() => setShowAddPasswordModal(true)}
              >
                Numpad
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600" htmlFor="nu-name">
              Display name
            </label>
            <input
              id="nu-name"
              className={input}
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-600" htmlFor="nu-role">
              Role
            </label>
            <select
              id="nu-role"
              className={input}
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as Role }))
              }
            >
              <option value={Role.STAFF}>Staff</option>
              <option value={Role.ADMIN}>Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary} disabled={busy}>
              Create user
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 font-medium text-stone-900">{u.displayName}</td>
                <td className="px-4 py-3 text-stone-600">{u.login}</td>
                <td className="px-4 py-3 text-stone-600">{u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      u.active ? "text-emerald-700" : "text-stone-400 line-through"
                    }
                  >
                    {u.active ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    onClick={() => setChangingPasswordUser(u)}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    onClick={() => void toggleActive(u)}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className={`${btn} border-red-200 text-red-800 hover:bg-red-50`}
                    disabled={busy}
                    onClick={() => void removeUser(u)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {changingPasswordUser && (
        <ChangePasswordModal
          userId={changingPasswordUser.id}
          actorId={actorId}
          userName={changingPasswordUser.displayName}
          onClose={() => setChangingPasswordUser(null)}
          onSuccess={() => {
            setChangingPasswordUser(null);
            alert("Password changed successfully");
          }}
        />
      )}

      {showAddPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-stone-800">Set Password</h2>
              <p className="mt-1 text-sm text-stone-500">For new user</p>
            </div>

          <div className="mb-4">
            <input
              type="password"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-400/20"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setShowAddPasswordModal(false);
                }
              }}
              autoFocus
            />
          </div>

            <NumberPad
              value={form.password}
              onChange={(val) => setForm((f) => ({ ...f, password: val }))}
              onSubmit={() => setShowAddPasswordModal(false)}
            />

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowAddPasswordModal(false)}
                className="text-sm font-medium text-stone-600 hover:text-stone-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
