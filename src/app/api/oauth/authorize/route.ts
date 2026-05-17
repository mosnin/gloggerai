import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { oauthClients, oauthAuthorizationCodes } from "@/db/schemas/oauth";
import { getCurrentUser } from "@/lib/auth/session";
import { fail } from "@/lib/api/response";
import { issueCsrfToken, requireCsrf } from "@/lib/api/csrf";
import { genAuthorizationCode, sha256Hex } from "@/lib/oauth/util";

export const dynamic = "force-dynamic";

type AuthParams = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
};

function readParams(searchParams: URLSearchParams): Partial<AuthParams> {
  return {
    client_id: searchParams.get("client_id") ?? undefined,
    redirect_uri: searchParams.get("redirect_uri") ?? undefined,
    response_type: searchParams.get("response_type") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    code_challenge: searchParams.get("code_challenge") ?? undefined,
    code_challenge_method: searchParams.get("code_challenge_method") ?? undefined,
  };
}

async function loadClient(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  return row ?? null;
}

function validate(p: Partial<AuthParams>): string | null {
  if (!p.client_id || !p.redirect_uri || !p.code_challenge) return "missing required params";
  if (p.response_type !== "code") return "response_type must be 'code'";
  const method = p.code_challenge_method ?? "S256";
  if (method !== "S256" && method !== "plain") return "code_challenge_method must be S256 or plain";
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = readParams(url.searchParams);
  const verr = validate(p);
  if (verr) return fail("invalid_request", verr, 400);
  const client = await loadClient(p.client_id!);
  if (!client) return fail("invalid_client", "Unknown client_id", 400);
  if (!client.redirectUris.includes(p.redirect_uri!)) return fail("invalid_redirect_uri", "redirect_uri not registered", 400);

  const requestedScopes = (p.scope ?? "").split(/\s+/).filter(Boolean);
  const disallowed = requestedScopes.filter((s) => !client.allowedScopes.includes(s));
  if (disallowed.length) return fail("invalid_scope", `scopes not allowed: ${disallowed.join(",")}`, 400);

  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(`/api/oauth/authorize?${url.searchParams.toString()}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }

  // Issue or refresh the CSRF cookie before rendering the consent form. The
  // form embeds the same token in a hidden field; the POST handler enforces
  // double-submit equality. Without this guard a malicious site could trick
  // a logged-in user into auto-approving an OAuth app.
  const csrfToken = await issueCsrfToken();

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Authorize ${escape(client.name)}</title>
<style>body{font-family:system-ui;margin:0;padding:48px;background:#fafafa}main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px}h1{margin:0 0 8px;font-size:22px}p{color:#555;margin:0 0 12px}ul{margin:8px 0 24px;padding-left:20px;color:#444}button{background:#111;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer}button.cancel{background:#fff;color:#111;border:1px solid #ddd;margin-right:8px}code{background:#f3f3f3;padding:2px 6px;border-radius:4px;font-size:12px}</style></head>
<body><main>
<h1>Authorize ${escape(client.name)}</h1>
<p>Signed in as <strong>@${escape(user.handle)}</strong>. This app is requesting:</p>
<ul>${requestedScopes.map((s) => `<li><code>${escape(s)}</code></li>`).join("") || "<li>(no scopes requested)</li>"}</ul>
<form method="POST" action="/api/oauth/authorize">
${Object.entries(p)
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(String(v))}">`)
  .join("")}
<input type="hidden" name="csrf_token" value="${escape(csrfToken)}">
<button class="cancel" name="decision" value="deny" type="submit">Deny</button>
<button name="decision" value="approve" type="submit">Approve</button>
</form>
</main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  // Form posts the CSRF token in a hidden field rather than a header — the
  // requireCsrf helper still does cookie equality check via x-csrf-token, so
  // we mirror the form field into the header before validating.
  const csrfFromForm = String(form.get("csrf_token") ?? "");
  const reqWithHeader = new Request(req.url, {
    method: req.method,
    headers: new Headers([
      ...Array.from(req.headers.entries()),
      ["x-csrf-token", csrfFromForm],
    ]),
  }) as unknown as NextRequest;
  const csrf = await requireCsrf(reqWithHeader);
  if (csrf) return csrf;

  const p: Partial<AuthParams> & { decision?: string } = {
    client_id: (form.get("client_id") as string) ?? undefined,
    redirect_uri: (form.get("redirect_uri") as string) ?? undefined,
    response_type: (form.get("response_type") as string) ?? undefined,
    scope: (form.get("scope") as string) ?? undefined,
    state: (form.get("state") as string) ?? undefined,
    code_challenge: (form.get("code_challenge") as string) ?? undefined,
    code_challenge_method: (form.get("code_challenge_method") as string) ?? undefined,
    decision: (form.get("decision") as string) ?? undefined,
  };
  const verr = validate(p);
  if (verr) return fail("invalid_request", verr, 400);
  const user = await getCurrentUser();
  if (!user) return fail("unauthenticated", "Sign in required", 401);
  const client = await loadClient(p.client_id!);
  if (!client) return fail("invalid_client", "Unknown client_id", 400);
  if (!client.redirectUris.includes(p.redirect_uri!)) return fail("invalid_redirect_uri", "redirect_uri not registered", 400);

  const redirect = new URL(p.redirect_uri!);
  if (p.state) redirect.searchParams.set("state", p.state);

  if (p.decision !== "approve") {
    redirect.searchParams.set("error", "access_denied");
    return NextResponse.redirect(redirect.toString(), { status: 302 });
  }

  const requestedScopes = (p.scope ?? "").split(/\s+/).filter(Boolean);
  const grantedScopes = requestedScopes.filter((s) => client.allowedScopes.includes(s));
  const code = genAuthorizationCode();
  const codeHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await db.insert(oauthAuthorizationCodes).values({
    codeHash,
    clientId: client.clientId,
    userId: user.id,
    scopes: grantedScopes,
    redirectUri: p.redirect_uri!,
    codeChallenge: p.code_challenge!,
    codeChallengeMethod: p.code_challenge_method ?? "S256",
    expiresAt,
  });
  redirect.searchParams.set("code", code);
  return NextResponse.redirect(redirect.toString(), { status: 302 });
}
