// Shared OAuth provider helpers para Fase 4 (Integrações).
// IMPORTANTE: NUNCA logar response body de trocas de token. Apenas status HTTP e error codes.

export type ProviderSlug =
  | "google_workspace"
  | "notion"
  | "todoist"
  | "calcom"
  | "microsoft_365";

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null; // segundos
  account_email?: string | null;
  account_name?: string | null;
  granted_scopes?: string[];
}

export interface ProviderEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function sanitizeProviderLogValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  return normalized
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .slice(0, 220);
}

async function logOAuthHttpFailure(
  label: string,
  res: Response,
  tokenUrl: string,
  redirectUri?: string,
): Promise<void> {
  let errorCode: string | null = null;
  let errorDescription: string | null = null;

  try {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await res.json() as {
        error?: unknown;
        error_description?: unknown;
        error_uri?: unknown;
      };
      errorCode = sanitizeProviderLogValue(payload.error);
      errorDescription = sanitizeProviderLogValue(payload.error_description ?? payload.error_uri);
    } else {
      errorDescription = sanitizeProviderLogValue(await res.text());
    }
  } catch (_) {
    errorDescription = "unreadable_error_payload";
  }

  let tokenHost = "invalid_token_url";
  try {
    tokenHost = new URL(tokenUrl).host;
  } catch (_) { /* keep fallback */ }

  console.error(
    [
      `${label} status=${res.status}`,
      `error=${errorCode ?? "unknown"}`,
      `description=${errorDescription ?? "unavailable"}`,
      `token_host=${tokenHost}`,
      redirectUri ? `redirect_uri=${redirectUri}` : null,
    ].filter(Boolean).join(" "),
  );
}

function readFirstEnv(keys: string[]): string {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  return "";
}

export function getProviderEnv(slug: ProviderSlug, redirectUri: string): ProviderEnv {
  const map: Record<ProviderSlug, { id: string[]; secret: string[] }> = {
    google_workspace: {
      id: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_CLIENT_ID"],
      secret: ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"],
    },
    notion: {
      id: ["NOTION_OAUTH_CLIENT_ID", "NOTION_CLIENT_ID"],
      secret: ["NOTION_OAUTH_CLIENT_SECRET", "NOTION_CLIENT_SECRET"],
    },
    todoist: {
      id: ["TODOIST_OAUTH_CLIENT_ID", "TODOIST_CLIENT_ID"],
      secret: ["TODOIST_OAUTH_CLIENT_SECRET", "TODOIST_CLIENT_SECRET"],
    },
    calcom: {
      id: ["CALCOM_OAUTH_CLIENT_ID", "CALCOM_CLIENT_ID"],
      secret: ["CALCOM_OAUTH_CLIENT_SECRET", "CALCOM_CLIENT_SECRET"],
    },
    microsoft_365: {
      id: ["MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_CLIENT_ID"],
      secret: ["MICROSOFT_OAUTH_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"],
    },
  };
  const keys = map[slug];
  const clientId = readFirstEnv(keys.id);
  const clientSecret = readFirstEnv(keys.secret);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Credenciais OAuth ausentes para ${slug} (${keys.id.join(" ou ")}/${keys.secret.join(" ou ")})`,
    );
  }
  return { clientId, clientSecret, redirectUri };
}


/**
 * Monta a URL de autorização para iniciar o fluxo OAuth.
 */
export function buildAuthorizeUrl(
  slug: ProviderSlug,
  authorizeUrl: string,
  scopes: string[],
  state: string,
  env: ProviderEnv,
): string {
  const u = new URL(authorizeUrl);
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);

  switch (slug) {
    case "google_workspace": {
      u.searchParams.set("scope", scopes.join(" "));
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      break;
    }
    case "microsoft_365": {
      // Garante offline_access para receber refresh_token
      const withOffline = scopes.includes("offline_access")
        ? scopes
        : ["offline_access", ...scopes];
      u.searchParams.set("scope", withOffline.join(" "));
      u.searchParams.set("response_mode", "query");
      break;
    }
    case "notion": {
      u.searchParams.set("owner", "user");
      break;
    }
    case "todoist": {
      u.searchParams.set("scope", scopes.join(","));
      break;
    }
    case "calcom": {
      u.searchParams.set("scope", scopes.join(" "));
      break;
    }
  }

  return u.toString();
}

/**
 * Troca o `code` por tokens. NUNCA loga response body bruto nem tokens.
 */
export async function exchangeCodeForTokens(
  slug: ProviderSlug,
  code: string,
  tokenUrl: string,
  env: ProviderEnv,
): Promise<TokenExchangeResult> {
  switch (slug) {
    case "google_workspace": {
      const body = new URLSearchParams({
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: env.redirectUri,
        grant_type: "authorization_code",
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        await logOAuthHttpFailure("google token exchange", res, tokenUrl, env.redirectUri);
        throw new Error("provider_error");
      }
      const tokens = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      // userinfo
      let email: string | null = null;
      let name: string | null = null;
      try {
        const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (ui.ok) {
          const u = await ui.json() as { email?: string; name?: string };
          email = u.email ?? null;
          name = u.name ?? null;
        }
      } catch (_) { /* best effort */ }
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_in: tokens.expires_in ?? null,
        account_email: email,
        account_name: name,
        granted_scopes: tokens.scope ? tokens.scope.split(" ") : [],
      };
    }

    case "notion": {
      const basic = btoa(`${env.clientId}:${env.clientSecret}`);
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: env.redirectUri,
        }),
      });
      if (!res.ok) {
        await logOAuthHttpFailure("notion token exchange", res, tokenUrl, env.redirectUri);
        throw new Error("provider_error");
      }
      const t = await res.json() as {
        access_token: string;
        workspace_name?: string;
        workspace_id?: string;
        owner?: { user?: { person?: { email?: string }; name?: string } };
      };
      return {
        access_token: t.access_token,
        refresh_token: null,
        expires_in: null,
        account_email: t.owner?.user?.person?.email ?? null,
        account_name: t.workspace_name ?? t.owner?.user?.name ?? null,
      };
    }

    case "microsoft_365": {
      const body = new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: env.redirectUri,
        grant_type: "authorization_code",
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        await logOAuthHttpFailure("microsoft token exchange", res, tokenUrl, env.redirectUri);
        throw new Error("provider_error");
      }
      const t = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        id_token?: string;
        scope?: string;
      };
      let email: string | null = null;
      let name: string | null = null;
      if (t.id_token) {
        try {
          const payload = JSON.parse(
            atob(t.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          ) as { preferred_username?: string; email?: string; name?: string };
          email = payload.preferred_username ?? payload.email ?? null;
          name = payload.name ?? null;
        } catch (_) { /* ignore */ }
      }
      return {
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? null,
        expires_in: t.expires_in ?? null,
        account_email: email,
        account_name: name,
        granted_scopes: t.scope ? t.scope.split(" ") : [],
      };
    }

    case "calcom": {
      const body = new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
        redirect_uri: env.redirectUri,
        grant_type: "authorization_code",
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        await logOAuthHttpFailure("calcom token exchange", res, tokenUrl, env.redirectUri);
        throw new Error("provider_error");
      }
      const t = await res.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };
      let email: string | null = null;
      let name: string | null = null;
      try {
        const me = await fetch("https://api.cal.com/v2/me", {
          headers: { Authorization: `Bearer ${t.access_token}` },
        });
        if (me.ok) {
          const u = await me.json() as { data?: { email?: string; name?: string } };
          email = u.data?.email ?? null;
          name = u.data?.name ?? null;
        }
      } catch (_) { /* best effort */ }
      return {
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? null,
        expires_in: t.expires_in ?? null,
        account_email: email,
        account_name: name,
      };
    }

    case "todoist": {
      const body = new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        code,
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        await logOAuthHttpFailure("todoist token exchange", res, tokenUrl);
        throw new Error("provider_error");
      }
      const t = await res.json() as { access_token: string };
      let email: string | null = null;
      let name: string | null = null;
      try {
        const me = await fetch("https://api.todoist.com/rest/v2/user", {
          headers: { Authorization: `Bearer ${t.access_token}` },
        });
        if (me.ok) {
          const u = await me.json() as { email?: string; full_name?: string };
          email = u.email ?? null;
          name = u.full_name ?? null;
        }
      } catch (_) { /* best effort */ }
      return {
        access_token: t.access_token,
        refresh_token: null,
        expires_in: null,
        account_email: email,
        account_name: name,
      };
    }
  }
}

/**
 * Refresh access_token usando refresh_token. NUNCA loga body bruto nem tokens.
 */
export async function refreshAccessToken(
  slug: ProviderSlug,
  refreshToken: string,
  tokenUrl: string,
  env: ProviderEnv,
): Promise<{ access_token: string; refresh_token?: string | null; expires_in?: number | null }> {
  if (slug === "notion" || slug === "todoist") {
    throw new Error("not_supported");
  }
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.status === 400 || res.status === 401) {
    await logOAuthHttpFailure(`refresh ${slug} invalid_grant`, res, tokenUrl);
    throw new Error("invalid_grant");
  }
  if (!res.ok) {
    await logOAuthHttpFailure(`refresh ${slug}`, res, tokenUrl);
    throw new Error("provider_error");
  }
  const t = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_in: t.expires_in ?? null,
  };
}

/**
 * Faz uma chamada de validação leve (não consome refresh).
 */
export async function testProviderConnection(
  slug: ProviderSlug,
  accessToken: string,
): Promise<{ ok: boolean; status: number; account?: { email?: string; name?: string } }> {
  const calls: Record<ProviderSlug, { url: string; headers?: Record<string, string> }> = {
    google_workspace: {
      url: "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    notion: {
      url: "https://api.notion.com/v1/users/me",
      headers: { "Notion-Version": "2022-06-28" },
    },
    microsoft_365: {
      url: "https://graph.microsoft.com/v1.0/me",
    },
    calcom: {
      url: "https://api.cal.com/v2/me",
    },
    todoist: {
      url: "https://api.todoist.com/rest/v2/user",
    },
  };
  const cfg = calls[slug];
  const res = await fetch(cfg.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(cfg.headers ?? {}),
    },
  });
  if (!res.ok) return { ok: false, status: res.status };
  let account: { email?: string; name?: string } | undefined;
  try {
    const data = await res.json() as Record<string, unknown>;
    const email = (data.email ?? data.mail ?? data.userPrincipalName ?? data.full_name) as string | undefined;
    const name = (data.name ?? data.displayName ?? data.full_name) as string | undefined;
    account = { email, name };
  } catch (_) { /* ignore */ }
  return { ok: true, status: res.status, account };
}

/**
 * Revoga token no provider. Best-effort com 1 retry em timeout.
 */
export async function revokeToken(
  slug: ProviderSlug,
  accessToken: string,
  revokeUrl: string | null,
): Promise<{ ok: boolean; status: number; serverError: boolean }> {
  if (!revokeUrl || slug === "notion") {
    return { ok: true, status: 200, serverError: false };
  }

  const doCall = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      switch (slug) {
        case "google_workspace": {
          const u = new URL(revokeUrl);
          u.searchParams.set("token", accessToken);
          return await fetch(u.toString(), { method: "POST", signal: ctrl.signal });
        }
        case "todoist": {
          // Todoist precisa client_id/secret + access_token no body
          const clientId = readFirstEnv(["TODOIST_OAUTH_CLIENT_ID", "TODOIST_CLIENT_ID"]);
          const clientSecret = readFirstEnv(["TODOIST_OAUTH_CLIENT_SECRET", "TODOIST_CLIENT_SECRET"]);

          const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            access_token: accessToken,
          });
          return await fetch(revokeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: ctrl.signal,
          });
        }
        case "microsoft_365":
        case "calcom":
        default: {
          return await fetch(revokeUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ctrl.signal,
          });
        }
      }
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const res = await doCall();
    const serverError = res.status >= 500;
    if (serverError) {
      // 1 retry
      try {
        const res2 = await doCall();
        return { ok: res2.ok, status: res2.status, serverError: res2.status >= 500 };
      } catch (_) {
        return { ok: false, status: res.status, serverError: true };
      }
    }
    return { ok: res.ok || res.status >= 400 && res.status < 500, status: res.status, serverError: false };
  } catch (e) {
    console.error(`revoke ${slug} error`, e instanceof Error ? e.message : "unknown");
    // timeout — 1 retry
    try {
      const res2 = await doCall();
      return { ok: res2.ok, status: res2.status, serverError: res2.status >= 500 };
    } catch (_) {
      return { ok: false, status: 0, serverError: true };
    }
  }
}
