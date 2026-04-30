// oauth-callback (PÚBLICA — verify_jwt = false)
// Recebe code & state via GET query params, troca por tokens, salva no Vault, redireciona para o painel.
//
// CRÍTICO: NUNCA logar response body de troca de tokens. Apenas status HTTP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import {
  exchangeCodeForTokens,
  getProviderEnv,
  type ProviderSlug,
} from "../_shared/oauth-providers.ts";
import { syncAgentRuntimeSnapshot } from "../_shared/runtime-sync.ts";

const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

function siteUrl(): string {
  return Deno.env.get("SITE_URL") ?? "https://798b89e5-0dc6-412a-81be-a4b6dfea7b6c.lovable.app";
}

function redirect(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${siteUrl()}${path}` },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    console.error(`provider returned error=${oauthError}`);
    return redirect(`/painel/integracoes?error=${encodeURIComponent(oauthError)}`);
  }

  if (!code || !state) {
    return redirect("/painel/integracoes?error=missing_params");
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // 1. Consome state atomicamente (previne replay)
    const { data: stateRow, error: stErr } = await admin
      .from("oauth_state_tokens")
      .update({ consumed: true })
      .eq("state_token", state)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .select("user_id, mcp_id")
      .maybeSingle();

    if (stErr || !stateRow) {
      console.error("invalid_state", stErr?.message);
      return redirect("/painel/integracoes?error=invalid_state");
    }

    // 2. Busca MCP
    const { data: mcp } = await admin
      .from("available_mcps")
      .select("id, slug, oauth_token_url, supports_refresh_token")
      .eq("id", stateRow.mcp_id)
      .maybeSingle();

    if (!mcp) {
      return redirect("/painel/integracoes?error=mcp_not_found");
    }

    const slug = mcp.slug as ProviderSlug;
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;

    // 3. Troca code por tokens
    let tokens;
    try {
      const env = getProviderEnv(slug, redirectUri);
      tokens = await exchangeCodeForTokens(slug, code, mcp.oauth_token_url, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "provider_error";
      return redirect(`/painel/integracoes?error=${encodeURIComponent(msg)}`);
    }

    // 4. Busca integração existente para preservar refresh_token antigo se necessário
    const { data: existing } = await admin
      .from("user_integrations")
      .select("id, access_token_vault_id, refresh_token_vault_id")
      .eq("user_id", stateRow.user_id)
      .eq("mcp_id", mcp.id)
      .maybeSingle();

    // 5. Salva access_token no Vault
    const ts = Math.floor(Date.now() / 1000);
    const { data: accessVault, error: accessErr } = await admin
      .rpc("vault_create_secret", {
        secret_value: tokens.access_token,
        secret_name: `oauth_access_${stateRow.user_id}_${slug}_${ts}`,
        secret_description: `OAuth access token (${slug})`,
      })
      .single();
    if (accessErr || !accessVault) {
      console.error("vault access error", accessErr?.message);
      return redirect("/painel/integracoes?error=vault_error");
    }
    const accessVaultId = (accessVault as { secret_id: string }).secret_id;

    // 6. Refresh token: salva novo OU preserva antigo no caso Google sem refresh retornado
    let refreshVaultId: string | null = null;
    if (tokens.refresh_token) {
      const { data: rv, error: rErr } = await admin
        .rpc("vault_create_secret", {
          secret_value: tokens.refresh_token,
          secret_name: `oauth_refresh_${stateRow.user_id}_${slug}_${ts}`,
          secret_description: `OAuth refresh token (${slug})`,
        })
        .single();
      if (rErr || !rv) {
        console.error("vault refresh error", rErr?.message);
      } else {
        refreshVaultId = (rv as { secret_id: string }).secret_id;
      }
      // Se reconexão e tinha refresh antigo, deletar
      if (existing?.refresh_token_vault_id) {
        try {
          await admin.rpc("vault_delete_secret", {
            secret_id: existing.refresh_token_vault_id,
          });
        } catch (_) { /* ignore */ }
      }
    } else if (existing?.refresh_token_vault_id) {
      // Preserva refresh antigo (caso típico Google sem prompt=consent re-emitir)
      refreshVaultId = existing.refresh_token_vault_id;
    }

    // 7. Deleta access_token antigo
    if (existing?.access_token_vault_id) {
      try {
        await admin.rpc("vault_delete_secret", {
          secret_id: existing.access_token_vault_id,
        });
      } catch (_) { /* ignore */ }
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // 8. Upsert user_integrations
    const { error: upErr } = await admin
      .from("user_integrations")
      .upsert(
        {
          user_id: stateRow.user_id,
          mcp_id: mcp.id,
          status: "active",
          access_token_vault_id: accessVaultId,
          refresh_token_vault_id: refreshVaultId,
          token_expires_at: expiresAt,
          connected_account_email: tokens.account_email,
          connected_account_name: tokens.account_name,
          granted_scopes: tokens.granted_scopes ?? [],
          error_message: null,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,mcp_id" },
      );

    if (upErr) {
      console.error("user_integrations upsert error", upErr.message, upErr.code);
      // Mapeia códigos de erro do trigger
      const code = upErr.code;
      if (code === "P0001") return redirect("/painel/integracoes?error=no_subscription");
      if (code === "P0002") return redirect("/painel/integracoes?error=limit_reached");
      if (code === "P0003") return redirect("/painel/integracoes?error=plan_not_allowed");
      if (code === "P0005") return redirect("/painel/integracoes?error=agent_inactive");
      return redirect("/painel/integracoes?error=db_error");
    }

    const { data: agent } = await admin
      .from("agent_instances")
      .select("id")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();

    if (agent?.id) {
      try {
        await syncAgentRuntimeSnapshot({
          supabase: admin,
          agentInstanceId: agent.id,
          railwayToken: RAILWAY_API_TOKEN,
          apiKey: HERMES_API_SERVER_KEY,
          scope: "all",
        });
      } catch (syncErr) {
        console.error(
          "oauth-callback runtime sync warning",
          syncErr instanceof Error ? syncErr.message : String(syncErr),
        );
      }
    }

    return redirect(`/painel/integracoes?status=success&mcp=${encodeURIComponent(slug)}`);
  } catch (err) {
    console.error("oauth-callback fatal", err instanceof Error ? err.message : "unknown");
    return redirect("/painel/integracoes?error=internal_error");
  }
});
