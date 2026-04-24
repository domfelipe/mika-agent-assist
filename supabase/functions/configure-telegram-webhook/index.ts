// configure-telegram-webhook
// Gera secret aleatório, configura webhook no Telegram e marca telegram_webhook_configured=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { telegramApi } from "../_shared/telegram.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: agent, error: agentErr } = await admin
      .from("agent_instances")
      .select("id, uuid_tenant, telegram_bot_token_vault_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (agentErr || !agent) {
      return jsonResponse({ error: "Agente não encontrado." }, 404);
    }
    if (!agent.telegram_bot_token_vault_id) {
      return jsonResponse(
        { error: "Conecte um bot antes de configurar o webhook." },
        400,
      );
    }

    const token = await getDecryptedSecret(admin, agent.telegram_bot_token_vault_id);
    if (!token) {
      return jsonResponse(
        { error: "Token corrompido. Desconecte e reconecte o bot." },
        500,
      );
    }

    const webhookSecret = randomHex(32);
    const webhookUrl =
      `${supabaseUrl}/functions/v1/telegram-webhook?token=${agent.uuid_tenant}`;

    const setRes = await telegramApi(token, "setWebhook", {
      url: webhookUrl,
      allowed_updates: ["message"],
      drop_pending_updates: true,
      secret_token: webhookSecret,
    });

    if (!setRes.ok) {
      console.error("setWebhook failed", setRes);
      return jsonResponse(
        { error: "Falha ao configurar webhook no Telegram." },
        500,
      );
    }

    const { error: updErr } = await admin
      .from("agent_instances")
      .update({
        telegram_webhook_secret: webhookSecret,
        telegram_webhook_configured: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (updErr) {
      console.error("agent update error", updErr);
      return jsonResponse({ error: "Webhook configurado, mas falha ao salvar." }, 500);
    }

    // Auto-provisionamento: agora que temos token + webhook, disparamos provision-agent
    // de forma assíncrona. Não bloqueamos a resposta — falhas são tratadas via retry/admin.
    if (agent.status === "provisioning") {
      try {
        const provisionUrl = `${supabaseUrl}/functions/v1/provision-agent`;
        console.log(
          `auto-provision: disparando para agent ${agent.id} (user ${userId})`,
        );
        // Fire-and-forget: não fazemos await para não bloquear o cliente
        fetch(provisionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            agent_instance_id: agent.id,
            user_id: userId,
          }),
        }).catch((err) =>
          console.error("auto-provision fetch error:", err)
        );
      } catch (err) {
        console.error("auto-provision trigger error:", err);
        // Não re-throw — wizard do Telegram deve retornar sucesso mesmo se provision falhar
      }
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("configure-telegram-webhook fatal", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
