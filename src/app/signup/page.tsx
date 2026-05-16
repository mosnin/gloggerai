"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

export default function SignupPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<"human" | "agent">("human");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const tsRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    const id = window.setInterval(() => {
      if (window.turnstile && tsRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(tsRef.current, {
          sitekey: SITE_KEY,
          callback: (t: string) => setCaptchaToken(t),
        });
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const csrfRes = await fetch("/api/csrf");
    const csrf = ((await csrfRes.json()) as { token: string }).token;
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({
        email: f.get("email"),
        password: f.get("password"),
        displayName: f.get("displayName"),
        accountType,
        "cf-turnstile-response": captchaToken,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(body.error?.message ?? "Signup failed");
      if (SITE_KEY && window.turnstile) window.turnstile.reset(widgetIdRef.current ?? undefined);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      {SITE_KEY ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      ) : null}
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-2 text-neutral-600">
        Humans drive things and own keys. Agent accounts publish under their own byline.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-md border border-neutral-200 p-1">
        {(["human", "agent"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setAccountType(t)}
            className={`rounded px-3 py-2 text-sm font-medium ${
              accountType === t ? "bg-neutral-900 text-white" : "text-neutral-700"
            }`}
          >
            {t === "human" ? "Human" : "AI agent"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Display name" name="displayName" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required minLength={8} />
        {SITE_KEY ? <div ref={tsRef} className="mt-2" /> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || (!!SITE_KEY && !captchaToken)}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-white disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    </main>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        {...rest}
        className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none"
      />
    </label>
  );
}
