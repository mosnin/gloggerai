"use client";
import { useState } from "react";

type Client = {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  createdAt: Date | string;
};

const ALL_SCOPES = ["posts:read", "posts:write", "posts:publish", "posts:delete", "profile:read", "profile:write"];

export function OAuthApps({ initial }: { initial: Client[] }) {
  const [clients, setClients] = useState(initial);
  const [name, setName] = useState("");
  const [redirect, setRedirect] = useState("");
  const [scopes, setScopes] = useState<string[]>(["posts:read", "posts:write"]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ clientId: string; clientSecret: string } | null>(null);
  const [rotated, setRotated] = useState<{ id: string; clientSecret: string } | null>(null);

  async function create() {
    setBusy(true);
    setCreated(null);
    const res = await fetch("/api/oauth/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, redirectUris: [redirect], allowedScopes: scopes }),
    });
    setBusy(false);
    if (!res.ok) return;
    const data = await res.json();
    setCreated({ clientId: data.clientId, clientSecret: data.clientSecret });
    setClients((prev) => [
      {
        id: data.id,
        clientId: data.clientId,
        name: data.name,
        redirectUris: data.redirectUris,
        allowedScopes: data.allowedScopes,
        createdAt: new Date(),
      },
      ...prev,
    ]);
    setName("");
    setRedirect("");
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this OAuth app? Active tokens issued through it remain valid until revoked separately.")) return;
    const res = await fetch(`/api/oauth/clients/${id}`, { method: "DELETE" });
    if (res.ok) setClients((prev) => prev.filter((c) => c.id !== id));
  }

  async function rotate(id: string) {
    if (!confirm("Rotate the client_secret? Existing integrations must be updated.")) return;
    const res = await fetch(`/api/oauth/clients/${id}?action=rotate_secret`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setRotated({ id, clientSecret: data.clientSecret });
  }

  return (
    <div className="mt-4">
      <div className="rounded-md border border-neutral-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="App name"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            value={redirect}
            onChange={(e) => setRedirect(e.target.value)}
            placeholder="https://example.com/callback"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) =>
                  setScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                }
              />
              <code className="text-xs">{s}</code>
            </label>
          ))}
        </div>
        <button
          disabled={busy || !name || !redirect}
          onClick={create}
          className="mt-3 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Creating…" : "Register OAuth app"}
        </button>
      </div>

      {created ? (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Save the secret now — it won't be shown again:</p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs">client_id: {created.clientId}</code>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs">client_secret: {created.clientSecret}</code>
        </div>
      ) : null}

      <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200">
        {clients.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-neutral-500">
                <code>{c.clientId}</code> · {c.allowedScopes.join(", ")}
              </div>
              <div className="text-xs text-neutral-400">{c.redirectUris.join(", ")}</div>
              {rotated && rotated.id === c.id ? (
                <code className="mt-2 block break-all rounded bg-emerald-50 p-2 font-mono text-xs text-emerald-900">
                  new client_secret: {rotated.clientSecret}
                </code>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button onClick={() => rotate(c.id)} className="text-sm text-neutral-700 underline">
                rotate secret
              </button>
              <button onClick={() => revoke(c.id)} className="text-sm text-red-600 underline">
                revoke
              </button>
            </div>
          </li>
        ))}
        {clients.length === 0 ? <li className="p-4 text-sm text-neutral-500">No OAuth apps yet.</li> : null}
      </ul>
    </div>
  );
}
