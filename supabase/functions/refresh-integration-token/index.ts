// refresh-integration-token (autenticada JWT)
// Renova access_token usando refresh_token. Marca como 'revoked' se invalid_grant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getProviderEnv,
  type ProviderSlug,
  refreshAccessToken,
} from "../_shared/oauth-providers.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getDecryptedSecret(
  admin: ReturnType<typeof createClient>,
  secretId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .rpc("vault_decrypt_secret", { secret_id: secretId })
    .single();
  if (!error && data) {
    // deno-lint-ignore no-explicit-any
    return (data as any).decrypted_secret ?? (data as unknown as string);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }
    const userId = userData.user.id;

    const { integration_id } = await req.json() as { integration_id?: string };
    if (!integration_id) {
      return jsonResponse({ error: "integration_id é obrigatório" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: integ, error: iErr } = await admin
      .from("user_integrations")
      .select(
        "id, user_id, mcp_id, access_token_vault_id, refresh_token_vault_id, mcp:available_mcps(slug, oauth_token_url, supports_refresh_token)",
      )
      .eq("id", integration_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (iErr || !integ) {
      return jsonResponse({ error: "Integração não encontrada" }, 404);
    }

    // deno-lint-ignore no-explicit-any
    const mcp = (integ as any).mcp as { slug: string; oauth_token_url: string; supports_refresh_token: boolean };

    if (!mcp.supports_refresh_token) {
      return jsonResponse(
        { error: "Provider não suporta refresh token" },
        400,
      );
    }

    if (!integ.refresh_token_vault_id) {
      return jsonResponse(
        { error: "Sem refresh token salvo. Reconecte a integração." },
        400,
      );
    }

    const refreshToken = await getDecryptedSecret(admin, integ.refresh_token_vault_id);
    if (!refreshToken) {
      return jsonResponse({ error: "Falha ao ler refresh token do Vault" }, 500);
    }

    const slug = mcp.slug as ProviderSlug;
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;
    const env = getProviderEnv(slug, redirectUri);

    let result;
    try {
      result = await refreshAccessToken(slug, refreshToken, mcp.oauth_token_url, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg === "invalid_grant") {
        await admin
          .from("user_integrations")
          .update({
            status: "revoked",
            error_message: "Refresh token revogado pelo provider. Reconecte a integração.",
          })
          .eq("id", integration_id);
        return jsonResponse({ error: "Refresh token revogado. Reconecte." }, 401);
      }
      return jsonResponse({ error: "Falha ao renovar token" }, 502);
    }

    // Salva novo access_token no Vault, deleta antigo
    const ts = Math.floor(Date.now() / 1000);
    const { data: newAccess, error: vErr } = await admin
      .rpc("vault_create_secret", {
        secret_value: result.access_token,
        secret_name: `oauth_access_${userId}_${slug}_${ts}`,
        secret_description: `OAuth access token (${slug}) refreshed`,
      })
      .single();
    if (vErr || !newAccess) {
      return jsonResponse({ error: "Falha ao salvar novo token" }, 500);
    }
    const newAccessId = (newAccess as { secret_id: string }).secret_id;

    if (integ.access_token_vault_id) {
      try {
        await admin.rpc("vault_delete_secret", {
          secret_id: integ.access_token_vault_id,
        });
      } catch (_) { /* ignore */ }
    }

    // Se provider rotou refresh_token, salva novo
    let newRefreshId = integ.refresh_token_vault_id;
    if (result.refresh_token && result.refresh_token !== refreshToken) {
      const { data: nrv } = await admin
        .rpc("vault_create_secret", {
          secret_value: result.refresh_token,
          secret_name: `oauth_refresh_${userId}_${slug}_${ts}`,
          secret_description: `OAuth refresh token (${slug}) rotated`,
        })
        .single();
      if (nrv) {
        const id = (nrv as { secret_id: string }).secret_id;
        try {
          await admin.rpc("vault_delete_secret", {
            secret_id: integ.refresh_token_vault_id,
          });
        } catch (_) { /* ignore */ }
        newRefreshId = id;
      }
    }

    const expiresAt = result.expires_in
      ? new Date(Date.now() + result.expires_in * 1000).toISOString()
      : null;

    await admin
      .from("user_integrations")
      .update({
        status: "active",
        access_token_vault_id: newAccessId,
        refresh_token_vault_id: newRefreshId,
        token_expires_at: expiresAt,
        last_refreshed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", integration_id);

    return jsonResponse({ success: true, expires_at: expiresAt });
  } catch (err) {
    console.error("refresh-integration-token fatal", err instanceof Error ? err.message : "unknown");
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
