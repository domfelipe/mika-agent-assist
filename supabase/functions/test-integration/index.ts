// Testa uma integração OAuth fazendo uma chamada leve ao provider.
// Não consome refresh token. Atualiza status caso receba 401.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { type ProviderSlug, testProviderConnection } from "../_shared/oauth-providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  let body: { integration_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { integration_id } = body;
  if (!integration_id) return json({ error: "integration_id é obrigatório" }, 400);

  // Busca integração + ownership + mcp slug
  const { data: integration, error: intErr } = await admin
    .from("user_integrations")
    .select(
      "id, user_id, status, access_token_vault_id, mcp_id, available_mcps!inner(slug, supports_refresh_token)",
    )
    .eq("id", integration_id)
    .maybeSingle();

  if (intErr || !integration) return json({ error: "Integração não encontrada" }, 404);
  if (integration.user_id !== userId) return json({ error: "Acesso negado" }, 403);
  if (!integration.access_token_vault_id) return json({ error: "Token ausente" }, 400);

  // @ts-expect-error nested
  const slug = integration.available_mcps.slug as ProviderSlug;
  // @ts-expect-error nested
  const supportsRefresh = integration.available_mcps.supports_refresh_token as boolean;

  // Decrypt access token
  const { data: secretRows, error: secretErr } = await admin.rpc("vault_decrypt_secret", {
    secret_id: integration.access_token_vault_id,
  });
  if (secretErr || !secretRows?.[0]?.decrypted_secret) {
    return json({ error: "Falha ao recuperar token" }, 500);
  }
  const accessToken = secretRows[0].decrypted_secret as string;

  try {
    const result = await testProviderConnection(slug, accessToken);
    if (result.ok) {
      // Garante status 'active' se estava em erro/expirado
      if (integration.status !== "active") {
        await admin
          .from("user_integrations")
          .update({ status: "active", error_message: null, updated_at: new Date().toISOString() })
          .eq("id", integration_id);
      }
      return json({ success: true, account_info: result.account ?? null });
    }
    if (result.status === 401) {
      const newStatus = supportsRefresh ? "expired" : "revoked";
      await admin
        .from("user_integrations")
        .update({
          status: newStatus,
          error_message: "Token inválido. Reconecte a integração.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration_id);
      return json({ error: "Token inválido", status: newStatus }, 401);
    }
    return json({ error: `Provider retornou ${result.status}` }, 502);
  } catch (e) {
    console.error("test-integration error", e instanceof Error ? e.message : "unknown");
    return json({ error: "Falha ao testar conexão" }, 500);
  }
});
