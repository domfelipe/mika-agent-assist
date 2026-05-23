// managed-bot-webhook
// Recebe updates do @mika_managerbot. Quando o update tem o campo "managed_bot",
// busca o token do novo bot via getManagedBotToken, salva no Vault, atualiza
// o agent_instance correspondente e dispara provisionamento automático.
//
// Setup do webhook: GET ?setup=true configura o webhook do manager bot.
//
// IMPORTANTE: Esta função usa endpoints experimentais do BotFather Bot
// Management Mode que NÃO são parte da Bot API pública oficial.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function ack(): Response {
  // Sempre 200 — Telegram não deve retentar.
  return new Response("ok", { status: 200 });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const managerToken = Deno.env.get("TELEGRAM_MANAGER_BOT_TOKEN");

  // Setup: configura webhook
  if (url.searchParams.get("setup") === "true") {
    if (!managerToken) {
      return json({ error: "TELEGRAM_MANAGER_BOT_TOKEN não configurado" }, 400);
    }
    const webhookUrl = `${supabaseUrl}/functions/v1/managed-bot-webhook`;
    const res = await fetch(
      `https://api.telegram.org/bot${managerToken}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "managed_bot"],
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    return json({ webhook_set: webhookUrl, telegram_response: data });
  }

  if (req.method !== "POST") {
    return ack();
  }

  // Verificação de origem: se TELEGRAM_MANAGER_BOT_WEBHOOK_SECRET estiver
  // configurado, exige o header X-Telegram-Bot-Api-Secret-Token correspondente.
  // Caso contrário, opera em modo permissivo (comportamento anterior) + log.
  const expectedSecret = Deno.env.get("TELEGRAM_MANAGER_BOT_WEBHOOK_SECRET") ?? "";
  if (expectedSecret) {
    const incoming = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (incoming !== expectedSecret) {
      console.warn("managed-bot-webhook: invalid telegram secret token");
      return new Response("unauthorized", { status: 401 });
    }
  } else {
    console.warn("managed-bot-webhook: TELEGRAM_MANAGER_BOT_WEBHOOK_SECRET ausente — modo permissivo");
  }

  if (!managerToken) {
    console.error("TELEGRAM_MANAGER_BOT_TOKEN ausente");
    return ack();
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return ack();
  }

  // Só processamos eventos de managed_bot
  // deno-lint-ignore no-explicit-any
  const managed = (update as any).managed_bot;
  if (!managed || !managed.bot) {
    return ack();
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey);

    const botId = managed.bot.id;
    const botUsername: string = managed.bot.username;
    // deno-lint-ignore no-explicit-any
    const tgUser = (managed as any).user ?? {};

    // 1) Busca token do bot recém-criado
    const tokenRes = await fetch(
      `https://api.telegram.org/bot${managerToken}/getManagedBotToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: botId }),
      },
    );
    const tokenJson = await tokenRes.json().catch(() => ({}));
    // deno-lint-ignore no-explicit-any
    const newBotToken: string | undefined = (tokenJson as any)?.result?.token;
    if (!newBotToken) {
      console.error("getManagedBotToken falhou", tokenJson);
      return ack();
    }

    // 2) Localiza agent_instance pendente correspondente
    const filter = tgUser?.id
      ? `telegram_user_chat_id.eq.${tgUser.id},managed_bot_suggested_username.eq.${botUsername}`
      : `managed_bot_suggested_username.eq.${botUsername}`;

    const { data: agentInstance, error: lookupErr } = await admin
      .from("agent_instances")
      .select("id, user_id")
      .eq("managed_bot_pending", true)
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupErr || !agentInstance) {
      console.error(
        "Nenhum agent_instance pendente encontrado para managed bot",
        { botUsername, tgUserId: tgUser?.id, lookupErr },
      );
      return ack();
    }

    // 3) Salva token no Vault (reutiliza vault_create_secret)
    const secretName = `telegram_bot_token_${agentInstance.id}_${Math.floor(
      Date.now() / 1000,
    )}`;
    const { data: vaultData, error: vaultErr } = await admin
      .rpc("vault_create_secret", {
        secret_value: newBotToken,
        secret_name: secretName,
        secret_description: `Managed bot token for agent ${agentInstance.id}`,
      })
      .single();

    if (vaultErr || !vaultData) {
      console.error("vault_create_secret falhou", vaultErr);
      return ack();
    }
    // deno-lint-ignore no-explicit-any
    const secretId = (vaultData as any).secret_id ?? vaultData;

    // 4) Atualiza agent_instance
    const { error: updErr } = await admin
      .from("agent_instances")
      .update({
        telegram_bot_token_vault_id: secretId,
        telegram_bot_username: botUsername,
        telegram_user_chat_id: tgUser?.id ? Number(tgUser.id) : null,
        telegram_connected_at: new Date().toISOString(),
        telegram_onboarding_completed: true,
        telegram_token_invalid: false,
        managed_bot_pending: false,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentInstance.id);

    if (updErr) {
      console.error("agent update falhou", updErr);
      return ack();
    }

    // 5) Dispara provisionamento (fire-and-forget)
    fetch(`${supabaseUrl}/functions/v1/provision-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "X-Internal-Secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
      },
      body: JSON.stringify({
        agent_instance_id: agentInstance.id,
        user_id: agentInstance.user_id,
      }),
    }).catch((err) => console.error("Auto-provision error:", err));

    return ack();
  } catch (err) {
    console.error("managed-bot-webhook fatal", err);
    return ack();
  }
});
