// disconnect-telegram
// Remove webhook no Telegram, deleta secret do Vault e limpa colunas em agent_instances.
// Preserva telegram_messages_log (auditoria) e telegram_onboarding_completed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { telegramApi } from "../_shared/telegram.ts";

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

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: agent, error: agentErr } = await admin
      .from("agent_instances")
      .select("id, telegram_bot_token_vault_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (agentErr || !agent) {
      return jsonResponse({ error: "Agente não encontrado." }, 404);
    }

    // 1) Tenta deletar webhook no Telegram (silent em falha)
    if (agent.telegram_bot_token_vault_id) {
      const token = await getDecryptedSecret(admin, agent.telegram_bot_token_vault_id);
      if (token) {
        try {
          await telegramApi(token, "deleteWebhook", { drop_pending_updates: true });
        } catch (e) {
          console.warn("deleteWebhook ignorado:", e);
        }
      }

      // 2) Remove secret do Vault via RPC
      try {
        await admin.rpc("vault_delete_secret", {
          secret_id: agent.telegram_bot_token_vault_id,
        });
      } catch (e) {
        console.warn("vault_delete_secret ignorado:", e);
      }
    }

    // 3) Limpa colunas no agent_instances
    const { error: updErr } = await admin
      .from("agent_instances")
      .update({
        telegram_bot_token_vault_id: null,
        telegram_bot_username: null,
        telegram_webhook_configured: false,
        telegram_webhook_secret: null,
        telegram_first_message_received_at: null,
        telegram_connected_at: null,
        telegram_token_invalid: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (updErr) {
      console.error("agent update error", updErr);
      return jsonResponse({ error: "Falha ao desconectar." }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("disconnect-telegram fatal", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
