"use client";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const csrf = ((await (await fetch("/api/csrf")).json()) as { token: string }).token;
    await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ email: f.get("email") }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Forgot password</h1>
      {sent ? (
        <p className="mt-6 text-sm text-neutral-700">
          If an account exists for that email, a reset link has been sent.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="block w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            disabled={loading}
            className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-white disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
