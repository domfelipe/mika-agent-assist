// validate-telegram-bot
// Recebe { token } do usuário autenticado, valida no Telegram via getMe,
// garante unicidade do bot, salva o token no Vault e atualiza agent_instances.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { telegramApi } from "../_shared/telegram.ts";

interface GetMeResult {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const body = await req.json().catch(() => ({}));
    const token = (body?.token ?? "").toString().trim();
    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return jsonResponse(
        { error: "Token inválido. Verifique se copiou corretamente do BotFather." },
        400,
      );
    }

    // 1) Valida no Telegram
    const me = await telegramApi<GetMeResult>(token, "getMe");
    if (!me.ok) {
      if (me.status === 401 || me.status === 404) {
        return jsonResponse(
          { error: "Token inválido. Verifique se copiou corretamente do BotFather." },
          400,
        );
      }
      if (me.status === 429) {
        return jsonResponse(
          {
            error:
              "O Telegram está limitando nossas requisições. Aguarde 1 minuto e tente novamente.",
          },
          429,
        );
      }
      return jsonResponse(
        { error: me.description || "Falha ao validar token no Telegram." },
        502,
      );
    }

    const bot = me.result!;
    const botUsername = bot.username;
    const botName = bot.first_name;
    const botId = bot.id;

    // 2) Service-role client p/ banco e vault
    const admin = createClient(supabaseUrl, serviceKey);

    // 3) Garante que o usuário tem agent_instance
    const { data: agent, error: agentErr } = await admin
      .from("agent_instances")
      .select("id, telegram_bot_token_vault_id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (agentErr) {
      console.error("agent lookup error", agentErr);
      return jsonResponse({ error: "Falha ao localizar agente." }, 500);
    }
    if (!agent) {
      return jsonResponse(
        { error: "Seu agente ainda não está pronto. Aguarde o provisionamento." },
        409,
      );
    }
    if (agent.status === "suspended") {
      return jsonResponse(
        { error: "Agente suspenso. Regularize sua assinatura antes de conectar o Telegram." },
        403,
      );
    }
    // status='error' por falta de token anterior é recuperável — apenas seguimos.

    // 4) Verifica unicidade do bot username (em outro agent_instance)
    const { data: conflict } = await admin
      .from("agent_instances")
      .select("id")
      .eq("telegram_bot_username", botUsername)
      .neq("id", agent.id)
      .maybeSingle();

    if (conflict) {
      return jsonResponse(
        {
          error:
            "Este bot já está conectado a outra conta Mika. Crie um novo bot no BotFather.",
        },
        409,
      );
    }

    // 5) Se já houver um vault_id antigo, remove (reconexão)
    if (agent.telegram_bot_token_vault_id) {
      try { await admin.rpc("exec_sql_void", {} as never); } catch { /* ignore */ }
      // tenta remover diretamente; ignora falha
      const { error: delErr } = await admin
        .from("vault.secrets" as unknown as never)
        .delete()
        .eq("id", agent.telegram_bot_token_vault_id);
      if (delErr) {
        console.warn("Vault old secret delete (ignorável):", delErr.message);
      }
    }

    // 6) Cria secret no Vault via RPC SQL
    const secretName = `telegram_bot_token_${userId}_${Math.floor(Date.now() / 1000)}`;
    const { data: vaultData, error: vaultErr } = await admin
      .rpc("vault_create_secret", {
        secret_value: token,
        secret_name: secretName,
        secret_description: `Telegram bot token for user ${userId}`,
      })
      .single();

    let secretId: string | null = null;
    if (!vaultErr && vaultData) {
      // RPC pode retornar { secret_id } ou string
      // deno-lint-ignore no-explicit-any
      secretId = (vaultData as any).secret_id ?? (vaultData as unknown as string);
    } else {
      // Fallback: usa SQL direto via PostgREST (requer função vault.create_secret exposta).
      // Caso não exista a RPC, criamos via PostgREST raw SQL exec.
      const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/vault_create_secret`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret_value: token,
          secret_name: secretName,
          secret_description: `Telegram bot token for user ${userId}`,
        }),
      });
      if (sqlRes.ok) {
        const out = await sqlRes.json().catch(() => null);
        secretId =
          (Array.isArray(out) ? out[0]?.secret_id ?? out[0] : out?.secret_id ?? out) ?? null;
      } else {
        console.error("vault_create_secret RPC failed", await sqlRes.text());
      }
    }

    if (!secretId) {
      return jsonResponse(
        {
          error:
            "Não foi possível salvar o token com segurança. Tente novamente em instantes.",
        },
        500,
      );
    }

    // 7) Atualiza agent_instances
    const { error: updErr } = await admin
      .from("agent_instances")
      .update({
        telegram_bot_token_vault_id: secretId,
        telegram_bot_username: botUsername,
        telegram_connected_at: new Date().toISOString(),
        telegram_token_invalid: false,
        telegram_webhook_configured: false,
        telegram_first_message_received_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    if (updErr) {
      console.error("agent update error", updErr);
      return jsonResponse({ error: "Falha ao salvar dados do bot." }, 500);
    }

    return jsonResponse({
      valid: true,
      bot_username: botUsername,
      bot_name: botName,
      bot_id: botId,
    });
  } catch (err) {
    console.error("validate-telegram-bot fatal", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
