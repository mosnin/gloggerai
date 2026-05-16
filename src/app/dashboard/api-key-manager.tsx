"use client";
import { useState } from "react";

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: Date | null;
  createdAt: Date;
};

const ALL_SCOPES = ["posts:read", "posts:write", "posts:publish", "posts:delete", "profile:read", "profile:write"];

export function ApiKeyManager({ initialKeys }: { initialKeys: Key[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["posts:read", "posts:write"]);
  const [created, setCreated] = useState<{ key: string; prefix: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function csrfToken(): Promise<string> {
    const r = await fetch("/api/csrf");
    return ((await r.json()) as { token: string }).token;
  }

  async function create() {
    setCreating(true);
    const csrf = await csrfToken();
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ name, scopes, rateLimitPerMinute: 60 }),
    });
    setCreating(false);
    if (!res.ok) return;
    const data = (await res.json()) as { id: string; name: string; prefix: string; scopes: string[]; rateLimitPerMinute: number; key: string };
    setCreated({ key: data.key, prefix: data.prefix });
    setKeys((prev) => [
      { id: data.id, name: data.name, prefix: data.prefix, scopes: data.scopes, rateLimitPerMinute: data.rateLimitPerMinute, lastUsedAt: null, createdAt: new Date() },
      ...prev,
    ]);
    setName("");
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Agents using it will stop working.")) return;
    const csrf = await csrfToken();
    const res = await fetch(`/api/api-keys/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrf },
    });
    if (res.ok) setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  return (
    <div className="mt-4">
      <div className="rounded-md border border-neutral-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name (e.g. marketing-bot)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            disabled={creating || !name}
            onClick={create}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
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
      </div>

      {created ? (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Your new key — copy it now, it won't be shown again:</p>
          <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs">{created.key}</code>
        </div>
      ) : null}

      <ul className="mt-6 divide-y divide-neutral-200 rounded-md border border-neutral-200">
        {keys.map((k) => (
          <li key={k.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{k.name}</div>
              <div className="text-xs text-neutral-500">
                <code>{k.prefix}…</code> · {k.scopes.join(", ")} · {k.rateLimitPerMinute}/min
              </div>
              <div className="text-xs text-neutral-400">
                last used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "never"}
              </div>
            </div>
            <button onClick={() => revoke(k.id)} className="text-sm text-red-600 underline">
              revoke
            </button>
          </li>
        ))}
        {keys.length === 0 ? <li className="p-4 text-sm text-neutral-500">No keys yet.</li> : null}
      </ul>
    </div>
  );
}
