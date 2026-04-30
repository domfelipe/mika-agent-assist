// disconnect-integration (autenticada JWT)
// Lógica:
//   1. Checa cronjobs dependentes — se houver e force_pause_jobs=false, retorna 409.
//   2. Se force_pause_jobs=true, pausa todos os jobs dependentes.
//   3. Revoga token no provider (1 retry em timeout).
//   4. Se revoke 5xx/timeout: NÃO deleta nada, marca status='error', retorna 503.
//   5. Sucesso: deleta secrets do Vault e a row de user_integrations.
//
// TODO Fase 5: notify Hermes container to invalidate MCP config after disconnect.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { revokeToken, type ProviderSlug } from "../_shared/oauth-providers.ts";
import { syncAgentRuntimeSnapshot } from "../_shared/runtime-sync.ts";

const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function getDecryptedSecret(
  admin: any,
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

    const { integration_id, force_pause_jobs } = await req.json() as {
      integration_id?: string;
      force_pause_jobs?: boolean;
    };
    if (!integration_id) {
      return jsonResponse({ error: "integration_id é obrigatório" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: integ, error: iErr } = await admin
      .from("user_integrations")
      .select(
        "id, user_id, access_token_vault_id, refresh_token_vault_id, mcp:available_mcps(slug, oauth_revoke_url)",
      )
      .eq("id", integration_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (iErr || !integ) {
      return jsonResponse({ error: "Integração não encontrada" }, 404);
    }

    // deno-lint-ignore no-explicit-any
    const mcp = (integ as any).mcp as { slug: string; oauth_revoke_url: string | null };
    const slug = mcp.slug;

    // 1. Checa dependências
    const { data: dependentJobs } = await admin
      .from("scheduled_jobs")
      .select("id, name")
      .eq("user_id", userId)
      .neq("status", "archived")
      .contains("required_mcp_slugs", [slug]);

    if (dependentJobs && dependentJobs.length > 0 && !force_pause_jobs) {
      return jsonResponse(
        {
          error: "has_dependencies",
          dependent_jobs: dependentJobs,
        },
        409,
      );
    }

    let pausedCount = 0;
    if (dependentJobs && dependentJobs.length > 0 && force_pause_jobs) {
      const { error: pErr } = await admin
        .from("scheduled_jobs")
        .update({
          status: "paused",
          auto_paused_reason: `Integração ${slug} foi desconectada`,
        })
        .eq("user_id", userId)
        .neq("status", "archived")
        .contains("required_mcp_slugs", [slug]);
      if (!pErr) pausedCount = dependentJobs.length;
    }

    // 2. Busca tokens ANTES de qualquer delete
    const accessToken = integ.access_token_vault_id
      ? await getDecryptedSecret(admin, integ.access_token_vault_id)
      : null;

    // 3. Revoga no provider
    if (accessToken) {
      const revokeResult = await revokeToken(
        slug as ProviderSlug,
        accessToken,
        mcp.oauth_revoke_url,
      );

      if (revokeResult.serverError) {
        // NÃO deleta nada. Marca como erro.
        await admin
          .from("user_integrations")
          .update({
            status: "error",
            error_message: "Revoke falhou no provider. Tente novamente em alguns segundos.",
          })
          .eq("id", integration_id);
        return jsonResponse(
          { error: "revoke_failed", message: "O provider está indisponível. Tente novamente em instantes." },
          503,
        );
      }
    }

    // 4. Sucesso: deleta secrets e row
    const vaultIds = [integ.access_token_vault_id, integ.refresh_token_vault_id]
      .filter((id): id is string => Boolean(id));

    for (const vid of vaultIds) {
      try {
        await admin.rpc("vault_delete_secret", { secret_id: vid });
      } catch (e) {
        console.warn("vault_delete_secret ignored", e instanceof Error ? e.message : "unknown");
      }
    }

    const { error: dErr } = await admin
      .from("user_integrations")
      .delete()
      .eq("id", integration_id);

    if (dErr) {
      console.error("delete user_integrations error", dErr.message);
      return jsonResponse({ error: "Falha ao remover integração" }, 500);
    }

    const { data: agent } = await admin
      .from("agent_instances")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    let runtimeSyncError: string | null = null;
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
        runtimeSyncError = syncErr instanceof Error ? syncErr.message : "unknown";
        console.error(
          "disconnect-integration runtime sync warning",
          runtimeSyncError,
        );
      }
    }

    return jsonResponse({
      success: true,
      paused_jobs_count: pausedCount,
      runtime_sync_warning: runtimeSyncError,
    });
  } catch (err) {
    console.error("disconnect-integration fatal", err instanceof Error ? err.message : "unknown");
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
