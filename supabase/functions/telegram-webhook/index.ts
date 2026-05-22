// telegram-webhook (PÚBLICA — verify_jwt = false)
// Recebe updates legados do Telegram, valida 3 camadas (uuid_tenant, secret, rate limit)
// e registra mensagem em telegram_messages_log. O Hermes responde via polling/runtime;
// esta função nunca deve enviar fallback para o usuário final.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { telegramAck } from "../_shared/telegram.ts";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

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
        "id, user_id, status, telegram_webhook_secret, telegram_connected_at",
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

    console.log("telegram-webhook: update logged; runtime/polling owns the reply", {
      agent_id: agent.id,
      chat_id: chatId,
    });
    return telegramAck();
  } catch (err) {
    console.error("telegram-webhook fatal", err);
    return telegramAck();
  }
});
