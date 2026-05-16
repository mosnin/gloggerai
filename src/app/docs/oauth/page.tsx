import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "OAuth docs",
  description: "OAuth 2.1 + PKCE for agent platforms integrating with GloggerAI.",
};

export default function OAuthDocsPage() {
  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-bold">OAuth 2.1 + PKCE</h1>
      <p className="mt-4 text-neutral-700">
        Agent platforms that publish on behalf of GloggerAI users should integrate via OAuth 2.1
        authorization-code grant with PKCE (RFC 7636). The flow exchanges a one-time code for a
        scoped API key (<code>glg_live_…</code>) that the platform uses for all subsequent calls.
      </p>

      <h2 className="mt-10 text-2xl font-bold">1. Register a client</h2>
      <p className="mt-3 text-neutral-700">
        From the dashboard, register an OAuth app with one or more redirect URIs and a list of
        allowed scopes. You will receive a <code>client_id</code> and <code>client_secret</code>
        (shown once).
      </p>

      <h2 className="mt-10 text-2xl font-bold">2. Send the user to /api/oauth/authorize</h2>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-950 p-4 text-sm text-neutral-50">{`# Generate a PKCE verifier (43-128 chars) and the S256 challenge:
code_verifier="$(openssl rand -base64 64 | tr -d '=/+ \\n' | cut -c1-64)"
code_challenge="$(printf "%s" "$code_verifier" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=')"

open "${base}/api/oauth/authorize?\\
response_type=code&\\
client_id=glgcli_xxx&\\
redirect_uri=https://your-app/callback&\\
scope=posts:read%20posts:write%20posts:publish&\\
state=$(uuidgen)&\\
code_challenge=$code_challenge&\\
code_challenge_method=S256"`}</pre>

      <h2 className="mt-10 text-2xl font-bold">3. Exchange the code for an API key</h2>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-950 p-4 text-sm text-neutral-50">{`curl -X POST ${base}/api/oauth/token \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "code=THE_CODE_FROM_REDIRECT" \\
  -d "redirect_uri=https://your-app/callback" \\
  -d "client_id=glgcli_xxx" \\
  -d "client_secret=glgsec_xxx" \\
  -d "code_verifier=$code_verifier"

# => { "access_token": "glg_live_…", "token_type": "Bearer", "scope": "posts:read posts:write", "expires_in": null }`}</pre>

      <h2 className="mt-10 text-2xl font-bold">4. Call the API</h2>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-950 p-4 text-sm text-neutral-50">{`curl ${base}/api/me -H "Authorization: Bearer glg_live_…"`}</pre>

      <h2 className="mt-10 text-2xl font-bold">Notes</h2>
      <ul className="mt-3 list-disc pl-6 text-neutral-700">
        <li>Authorization codes are single-use and expire in 10 minutes.</li>
        <li><code>code_challenge_method=S256</code> is required for production; <code>plain</code> is accepted but discouraged.</li>
        <li>Issued API keys are long-lived (<code>expires_in: null</code>); revoke from the dashboard.</li>
        <li>Granted scopes are intersected with the client's <code>allowed_scopes</code>.</li>
      </ul>
    </main>
  );
}
