// oauth-start (autenticada via JWT)
// Recebe { mcp_slug }, valida plano e retorna { auth_url } para o frontend redirecionar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildAuthorizeUrl,
  getProviderEnv,
  type ProviderSlug,
} from "../_shared/oauth-providers.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateStateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const { mcp_slug } = await req.json() as { mcp_slug?: string };
    if (!mcp_slug) {
      return jsonResponse({ error: "mcp_slug é obrigatório" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Busca MCP
    const { data: mcp, error: mcpErr } = await admin
      .from("available_mcps")
      .select("id, slug, oauth_authorize_url, required_scopes, available_in_plans, is_active")
      .eq("slug", mcp_slug)
      .maybeSingle();

    if (mcpErr || !mcp || !mcp.is_active) {
      return jsonResponse({ error: "Integração não encontrada" }, 404);
    }

    // Valida agente ativo
    const { data: agent } = await admin
      .from("agent_instances")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!agent || agent.status !== "active") {
      return jsonResponse(
        { error: "agent_inactive", message: "Seu agente ainda não está ativo. Complete o onboarding." },
        403,
      );
    }

    // Valida plano
    const { data: limits } = await admin
      .from("user_integration_limits")
      .select("plan_slug, max_integrations, current_integrations_count")
      .eq("user_id", userId)
      .maybeSingle();

    if (!limits || !limits.plan_slug || !limits.max_integrations) {
      return jsonResponse(
        { error: "no_subscription", message: "Você precisa de uma assinatura ativa." },
        403,
      );
    }

    const availableIn = (mcp.available_in_plans as string[]) ?? [];
    if (!availableIn.includes(limits.plan_slug)) {
      return jsonResponse(
        {
          error: "plan_not_allowed",
          message: `A integração ${mcp.slug} não está disponível no plano ${limits.plan_slug}.`,
        },
        403,
      );
    }

    // Verifica se já não atingiu limite (evita iniciar fluxo que vai falhar)
    if (
      (limits.current_integrations_count ?? 0) >= limits.max_integrations
    ) {
      // Permite reconectar uma existente; mas se for nova vai falhar.
      const { data: existing } = await admin
        .from("user_integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("mcp_id", mcp.id)
        .maybeSingle();
      if (!existing) {
        return jsonResponse(
          { error: "limit_reached", message: "Você atingiu o limite de integrações do seu plano." },
          403,
        );
      }
    }

    // Gera state token
    const stateToken = generateStateToken();
    const { error: stErr } = await admin.from("oauth_state_tokens").insert({
      state_token: stateToken,
      user_id: userId,
      mcp_id: mcp.id,
    });
    if (stErr) {
      console.error("oauth_state insert error", stErr);
      return jsonResponse({ error: "Falha ao iniciar OAuth" }, 500);
    }

    // Monta URL de autorização
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;
    const env = getProviderEnv(mcp.slug as ProviderSlug, redirectUri);
    const authUrl = buildAuthorizeUrl(
      mcp.slug as ProviderSlug,
      mcp.oauth_authorize_url,
      (mcp.required_scopes as string[]) ?? [],
      stateToken,
      env,
    );

    return jsonResponse({ auth_url: authUrl });
  } catch (err) {
    console.error("oauth-start fatal", err instanceof Error ? err.message : "unknown");
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
