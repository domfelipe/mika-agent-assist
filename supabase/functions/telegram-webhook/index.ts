// telegram-webhook (PÚBLICA — verify_jwt = false)
// Recebe updates do Telegram, valida 3 camadas (uuid_tenant, secret, rate limit),
// registra mensagem em telegram_messages_log e responde com placeholder via sendMessage.
//
// TODO Fase 5: substituir resposta placeholder por proxy para container Hermes via SSH/API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { telegramApi, telegramAck } from "../_shared/telegram.ts";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "Mika";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "Mika";
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
  // Sempre responde 200 para o Telegram não retentar — ack cedo em qualquer falha.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const uuidTenant = url.searchParams.get("token");
    if (!uuidTenant) return telegramAck();

    const incomingSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";

    // 1) Localiza agente + nome do usuário
    const { data: agent, error: agentErr } = await admin
      .from("agent_instances")
      .select(
        "id, user_id, status, telegram_webhook_secret, telegram_bot_token_vault_id, telegram_connected_at, profiles:profiles!agent_instances_user_id_fkey(full_name)",
      )
      .eq("uuid_tenant", uuidTenant)
      .maybeSingle();

    if (agentErr || !agent) return telegramAck();
    if (agent.status === "suspended" || agent.status === "error") return telegramAck();

    // 2) Valida secret_token (anti-spoofing)
    if (
      !agent.telegram_webhook_secret ||
      incomingSecret !== agent.telegram_webhook_secret
    ) {
      console.warn("telegram-webhook: secret mismatch", { agent_id: agent.id });
      return new Response("unauthorized", { status: 401 });
    }

    // 3) Rate limit por agent_instance (30 req/min)
    const now = new Date();
    const { data: bucket } = await admin
      .from("telegram_rate_limit_bucket")
      .select("*")
      .eq("agent_instance_id", agent.id)
      .maybeSingle();

    if (!bucket) {
      await admin.from("telegram_rate_limit_bucket").insert({
        agent_instance_id: agent.id,
        request_count: 1,
        window_start: now.toISOString(),
        updated_at: now.toISOString(),
      });
    } else {
      const windowStart = new Date(bucket.window_start as string);
      const elapsed = now.getTime() - windowStart.getTime();
      if (elapsed > RATE_LIMIT_WINDOW_MS) {
        await admin
          .from("telegram_rate_limit_bucket")
          .update({
            request_count: 1,
            window_start: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("agent_instance_id", agent.id);
      } else {
        const newCount = (bucket.request_count as number) + 1;
        if (newCount > RATE_LIMIT_MAX) {
          console.warn("telegram-webhook: rate limit hit", { agent_id: agent.id });
          return telegramAck(); // throttle silencioso
        }
        await admin
          .from("telegram_rate_limit_bucket")
          .update({
            request_count: newCount,
            updated_at: now.toISOString(),
          })
          .eq("agent_instance_id", agent.id);
      }
    }

    // 4) Parse do payload
    const payload = await req.json().catch(() => null);
    if (!payload || !payload.message) return telegramAck();

    const message = payload.message;
    const chatId = message.chat?.id as number | undefined;
    if (!chatId) return telegramAck();

    const fromId = message.from?.id as number | null | undefined;
    const fromUsername = (message.from?.username as string | undefined) ?? null;
    const text = (message.text as string | undefined) ?? null;
    const entities = (message.entities as Array<{ type: string }> | undefined) ?? [];

    let messageType: "text" | "command" | "other" = "other";
    if (entities.some((e) => e.type === "bot_command")) messageType = "command";
    else if (text) messageType = "text";

    // 5) Detecta primeira mensagem da sessão atual
    let isFirstMessage = false;
    if (agent.telegram_connected_at) {
      const { count } = await admin
        .from("telegram_messages_log")
        .select("id", { count: "exact", head: true })
        .eq("agent_instance_id", agent.id)
        .eq("direction", "incoming")
        .gte("created_at", agent.telegram_connected_at as string);
      if ((count ?? 0) === 0) {
        isFirstMessage = true;
        await admin
          .from("agent_instances")
          .update({ telegram_first_message_received_at: now.toISOString() })
          .eq("id", agent.id);
      }
    }

    // 6) Insert da mensagem incoming
    await admin.from("telegram_messages_log").insert({
      agent_instance_id: agent.id,
      user_id: agent.user_id,
      telegram_chat_id: chatId,
      telegram_user_id: fromId ?? null,
      telegram_username: fromUsername,
      direction: "incoming",
      message_text: text,
      message_type: messageType,
      is_first_message: isFirstMessage,
      raw_payload: payload,
    });

    // 7) Resposta placeholder via sendMessage
    // TODO Fase 5: substituir resposta placeholder por proxy para container Hermes via SSH/API.
    if (!agent.telegram_bot_token_vault_id) return telegramAck();
    const token = await getDecryptedSecret(admin, agent.telegram_bot_token_vault_id as string);
    if (!token) return telegramAck();

    // deno-lint-ignore no-explicit-any
    const fullName = (agent as any).profiles?.full_name as string | null | undefined;
    const replyText =
      `Olá! Sou o Mika de ${firstName(fullName)}. Estou quase pronto para conversar com você de verdade — meu cérebro está sendo configurado pela DOMCO. Em breve vou responder de forma inteligente! Por enquanto, este é apenas um teste de conexão. ✨`;

    let send = await telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: replyText,
    });

    if (!send.ok && send.status === 401) {
      await admin
        .from("agent_instances")
        .update({ telegram_token_invalid: true, updated_at: new Date().toISOString() })
        .eq("id", agent.id);
      return telegramAck();
    }

    if (!send.ok && send.status === 429) {
      const retryAfter = send.parameters?.retry_after ?? 1;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      send = await telegramApi(token, "sendMessage", {
        chat_id: chatId,
        text: replyText,
      });
    }

    if (send.ok) {
      await admin.from("telegram_messages_log").insert({
        agent_instance_id: agent.id,
        user_id: agent.user_id,
        telegram_chat_id: chatId,
        direction: "outgoing",
        message_text: replyText,
        message_type: "text",
        is_first_message: false,
        raw_payload: send.result ?? null,
      });
    } else {
      console.error("sendMessage failed", send);
    }

    return telegramAck();
  } catch (err) {
    console.error("telegram-webhook fatal", err);
    return telegramAck();
  }
});
