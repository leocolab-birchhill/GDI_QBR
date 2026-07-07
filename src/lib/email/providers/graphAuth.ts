import { prisma } from "../../db";
import { env } from "../../env";

/**
 * Microsoft Graph OAuth2 (authorization-code flow with offline_access).
 *
 * Personal Microsoft accounts (outlook.com / hotmail / live) only support
 * DELEGATED auth — app-only/client-credentials is not allowed. So we sign a user
 * in once, capture a refresh token, and silently refresh the access token after.
 *
 * Tokens are stored in the EmailAccount table (id = "graph").
 */

const ACCOUNT_ID = "graph";

function authBase(): string {
  return `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/oauth2/v2.0`;
}

/** Scopes we request. Always include the bits we depend on for send + refresh. */
export function graphScopes(): string {
  const required = ["openid", "offline_access", "User.Read", "Mail.Send", "Mail.ReadWrite"];
  const configured = (env.MICROSOFT_SCOPES || "").split(/\s+/).filter(Boolean);
  const set = new Set<string>([...required, ...configured]);
  return Array.from(set).join(" ");
}

export function isGraphConfigured(): boolean {
  const id = env.MICROSOFT_CLIENT_ID ?? "";
  const secret = env.MICROSOFT_CLIENT_SECRET ?? "";
  const isReal = (v: string) => v.length > 5 && !v.toLowerCase().includes("placeholder");
  return isReal(id) && isReal(secret);
}

/** Build the Microsoft sign-in URL the admin visits once to connect the mailbox. */
export function buildAuthUrl(state = "qbr"): string {
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: env.MICROSOFT_REDIRECT_URI,
    response_mode: "query",
    scope: graphScopes(),
    state,
  });
  console.log(
    "[graph][authorize] tenant:",
    env.MICROSOFT_TENANT,
    "| redirect_uri:",
    env.MICROSOFT_REDIRECT_URI,
    "| scope:",
    graphScopes(),
  );
  return `${authBase()}/authorize?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const url = `${authBase()}/token`;
  // Log the request context WITHOUT secrets so the auth flow is visible in the terminal.
  const safe = { ...body, client_secret: body.client_secret ? "***redacted***" : undefined };
  console.log("[graph][token] POST", url, JSON.stringify(safe));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const raw = await res.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(raw) as TokenResponse;
  } catch {
    console.error("[graph][token] non-JSON response", res.status, raw);
    throw new Error(`Graph token endpoint returned ${res.status}: ${raw.slice(0, 300)}`);
  }

  if (!res.ok || json.error) {
    console.error("[graph][token] ERROR", res.status, JSON.stringify(json));
    throw new Error(
      `Graph token error: ${json.error ?? res.status} — ${json.error_description ?? "unknown"}`,
    );
  }
  console.log(
    "[graph][token] OK — got",
    json.refresh_token ? "access+refresh tokens" : "access token (NO refresh token!)",
    "scope:",
    json.scope,
  );
  return json;
}

/** Exchange an authorization code (from the callback) for tokens, then persist. */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const json = await tokenRequest({
    client_id: env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: env.MICROSOFT_REDIRECT_URI,
    scope: graphScopes(),
  });

  const email = await fetchUserEmail(json.access_token);
  const expiresAt = new Date(Date.now() + (json.expires_in - 60) * 1000);

  await prisma.emailAccount.upsert({
    where: { id: ACCOUNT_ID },
    update: {
      provider: "graph",
      email,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? undefined,
      expiresAt,
      scope: json.scope,
    },
    create: {
      id: ACCOUNT_ID,
      provider: "graph",
      email,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt,
      scope: json.scope,
    },
  });
}

/**
 * Bootstrap a Graph connection from GRAPH_REFRESH_TOKEN when the DB has none.
 * Lets the app auto-connect after `npm run dev` with zero clicks, even on a
 * fresh database. The seeded access token is intentionally expired so the next
 * call refreshes it immediately.
 */
export async function ensureSeededFromEnv(): Promise<void> {
  if (!env.GRAPH_REFRESH_TOKEN) return;
  const existing = await prisma.emailAccount.findUnique({ where: { id: ACCOUNT_ID } });
  if (existing?.refreshToken) return;
  await prisma.emailAccount.upsert({
    where: { id: ACCOUNT_ID },
    update: { refreshToken: env.GRAPH_REFRESH_TOKEN, provider: "graph", expiresAt: new Date(0) },
    create: {
      id: ACCOUNT_ID,
      provider: "graph",
      refreshToken: env.GRAPH_REFRESH_TOKEN,
      expiresAt: new Date(0),
    },
  });
  console.log("[graph] Seeded connection from GRAPH_REFRESH_TOKEN env var.");
}

/** Return a valid access token, refreshing it if expired. Throws if not connected. */
export async function getValidAccessToken(): Promise<string> {
  await ensureSeededFromEnv();
  const acct = await prisma.emailAccount.findUnique({ where: { id: ACCOUNT_ID } });
  if (!acct || !acct.refreshToken) {
    throw new Error(
      "Microsoft Graph is not connected. Visit /api/outlook/login to sign in and authorize the mailbox.",
    );
  }
  if (acct.accessToken && acct.expiresAt && acct.expiresAt.getTime() > Date.now()) {
    return acct.accessToken;
  }
  // Refresh.
  const json = await tokenRequest({
    client_id: env.MICROSOFT_CLIENT_ID ?? "",
    client_secret: env.MICROSOFT_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: acct.refreshToken,
    redirect_uri: env.MICROSOFT_REDIRECT_URI,
    scope: graphScopes(),
  });
  const expiresAt = new Date(Date.now() + (json.expires_in - 60) * 1000);
  await prisma.emailAccount.update({
    where: { id: ACCOUNT_ID },
    data: {
      accessToken: json.access_token,
      // Microsoft may rotate refresh tokens; keep the newest.
      refreshToken: json.refresh_token ?? acct.refreshToken,
      expiresAt,
      scope: json.scope ?? acct.scope,
    },
  });
  return json.access_token;
}

export async function getConnectedAccount() {
  await ensureSeededFromEnv();
  return prisma.emailAccount.findUnique({ where: { id: ACCOUNT_ID } });
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return me.mail ?? me.userPrincipalName ?? undefined;
  } catch {
    return undefined;
  }
}

export const GRAPH_ACCOUNT_ID = ACCOUNT_ID;
