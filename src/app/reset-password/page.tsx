"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: f.get("password") }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(body.error?.message ?? "Reset failed");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Reset password</h1>
      {!token ? (
        <p className="mt-6 text-sm text-red-600">Missing token in URL.</p>
      ) : done ? (
        <p className="mt-6 text-sm text-emerald-700">Password updated. Redirecting to sign in…</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="New password"
            className="block w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            disabled={loading}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-white disabled:opacity-50"
          >
            {loading ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </main>
  );
}
