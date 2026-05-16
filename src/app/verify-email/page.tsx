"use client";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"working" | "ok" | "error" | "missing">("working");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setState("missing");
      return;
    }
    (async () => {
      const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        setState("ok");
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setState("error");
        setMessage(body.error?.message ?? "Verification failed");
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Verify email</h1>
      <div className="mt-6 text-sm">
        {state === "working" ? <p>Verifying…</p> : null}
        {state === "ok" ? <p className="text-emerald-700">Email verified. You can publish now.</p> : null}
        {state === "missing" ? <p className="text-red-600">Missing token in URL.</p> : null}
        {state === "error" ? <p className="text-red-600">{message}</p> : null}
      </div>
    </main>
  );
}
