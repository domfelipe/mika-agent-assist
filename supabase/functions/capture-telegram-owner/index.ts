// capture-telegram-owner
// Após o cliente conectar o bot (validate-telegram-bot), pedimos a ele que
// envie /start ao próprio bot. Esta função faz polling no getUpdates do
// bot do cliente para descobrir o chat_id do dono. Quando encontra:
//   1) grava telegram_user_chat_id em agent_instances
//   2) envia mensagem de confirmação ao usuário
//   3) limpa o offset (markAsRead) chamando getUpdates com offset alto
//   4) se o agente já está provisionado no Railway, atualiza as env vars
//      TELEGRAM_ALLOWED_USERS / TELEGRAM_HOME_CHANNEL e dispara redeploy
//
// É chamada repetidamente pelo frontend (poll a cada 2s) até retornar
// { found: true } ou o usuário desistir.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { telegramApi } from "../_shared/telegram.ts";
import {
  deployRailwayService,
  getServiceContext,
  upsertRailwayVariableCollection,
} from "../_shared/railway.ts";

const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: { id: number; type?: string };
    from?: { id: number; is_bot?: boolean; username?: string; first_name?: string };
    text?: string;
  };
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

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Carrega agent + token do Vault
    const { data: agent, error: agentErr } = await admin
      .from("agent_instances")
      .select(
        "id, status, telegram_bot_token_vault_id, telegram_bot_username, telegram_user_chat_id, railway_service_id, vps_pool_id",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (agentErr || !agent) {
      return jsonResponse({ error: "Agente não encontrado." }, 404);
    }

    // Já capturado anteriormente — short-circuit
    if (agent.telegram_user_chat_id) {
      return jsonResponse({
        found: true,
        chat_id: Number(agent.telegram_user_chat_id),
        bot_username: agent.telegram_bot_username,
        already_captured: true,
      });
    }

    if (!agent.telegram_bot_token_vault_id) {
      return jsonResponse(
        { error: "Bot ainda não conectado. Volte e cole o token do BotFather." },
        409,
      );
    }

    const { data: secret } = await admin.rpc("vault_decrypt_secret", {
      secret_id: agent.telegram_bot_token_vault_id,
    });
    // deno-lint-ignore no-explicit-any
    const token: string = (secret?.[0] as any)?.decrypted_secret ?? "";
    if (!token) {
      return jsonResponse({ error: "Falha ao decifrar token." }, 500);
    }

    // 2) Garante que o webhook está deletado (senão getUpdates falha)
    await telegramApi(token, "deleteWebhook", { drop_pending_updates: false });

    // 3) Faz getUpdates com timeout curto (long polling 8s) — pega TODAS as mensagens recentes
    const updRes = await telegramApi<TelegramUpdate[]>(token, "getUpdates", {
      timeout: 8,
      allowed_updates: ["message"],
    });

    if (!updRes.ok) {
      console.error("getUpdates failed", updRes);
      return jsonResponse(
        { error: updRes.description || "Falha ao consultar Telegram." },
        502,
      );
    }

    const updates = updRes.result ?? [];

    // 4) Procura a primeira mensagem privada de um humano
    let ownerChatId: number | null = null;
    let ownerUsername: string | null = null;
    let ownerFirstName: string | null = null;
    let highestUpdateId = 0;

    for (const u of updates) {
      if (u.update_id > highestUpdateId) highestUpdateId = u.update_id;
      const msg = u.message;
      if (!msg) continue;
      const chat = msg.chat;
      const from = msg.from;
      if (!chat || !from || from.is_bot) continue;
      // Só aceita chat privado (chat.id === from.id em DMs)
      if (chat.type && chat.type !== "private") continue;

      ownerChatId = chat.id;
      ownerUsername = from.username ?? null;
      ownerFirstName = from.first_name ?? null;
      break;
    }

    // 5) Avança o offset para "consumir" os updates lidos (mesmo se não achou,
    // limpa lixo antigo). Usar offset = highest+1.
    if (highestUpdateId > 0) {
      await telegramApi(token, "getUpdates", {
        offset: highestUpdateId + 1,
        timeout: 0,
        limit: 1,
      });
    }

    if (!ownerChatId) {
      return jsonResponse({
        found: false,
        bot_username: agent.telegram_bot_username,
        hint: "Envie /start no Telegram ao seu bot para identificá-lo.",
      });
    }

    // 6) Persiste chat_id
    await admin
      .from("agent_instances")
      .update({
        telegram_user_chat_id: ownerChatId,
        telegram_first_message_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agent.id);

    // 7) Mensagem de confirmação imediata (é o último "ping" antes do Hermes assumir)
    await telegramApi(token, "sendMessage", {
      chat_id: ownerChatId,
      text:
        `✅ Tudo certo${ownerFirstName ? `, ${ownerFirstName}` : ""}! Seu agente está sendo ativado e em alguns instantes começa a conversar com você por aqui. ✨`,
    });

    return jsonResponse({
      found: true,
      chat_id: ownerChatId,
      username: ownerUsername,
      first_name: ownerFirstName,
      bot_username: agent.telegram_bot_username,
    });
  } catch (err) {
    console.error("capture-telegram-owner fatal", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado" },
      500,
    );
  }
});
