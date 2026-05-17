"use client";
import { useState } from "react";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const csrf = ((await (await fetch("/api/csrf")).json()) as { token: string }).token;
        await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf } });
        window.location.href = "/";
      }}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
