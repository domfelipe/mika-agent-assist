// admin-recover-telegram-owner
// Operação ADMIN one-shot para corrigir agentes provisionados ANTES do
// fluxo de captura automática. Faz:
//   1. Suspende o container Hermes (libera getUpdates do bot)
//   2. Long-polling getUpdates por até 90s buscando chat privado humano
//   3. Persiste telegram_user_chat_id em agent_instances
//   4. Atualiza Railway TELEGRAM_ALLOWED_USERS / TELEGRAM_HOME_CHANNEL
//   5. Retoma o container (resume) → o redeploy aplica as novas env vars
//
// O admin chama esta função e simultaneamente pede ao cliente para enviar
// /start no Telegram ao bot dele. A primeira mensagem privada captura o id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { telegramApi } from "../_shared/telegram.ts";
import {
  deployRailwayService,
  getServiceContext,
  setHermesSuspended,
  upsertRailwayVariableCollection,
} from "../_shared/railway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: { id: number; type?: string };
    from?: { id: number; is_bot?: boolean; username?: string; first_name?: string };
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!RAILWAY_API_TOKEN) {
    return jsonResponse({ error: "RAILWAY_API_TOKEN não configurado" }, 500);
  }

  // Auth admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid token" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return jsonResponse({ error: "admin role required" }, 403);

  const body = await req.json().catch(() => ({}));
  const agentId = (body?.agent_instance_id ?? "").toString();
  if (!agentId) return jsonResponse({ error: "agent_instance_id required" }, 400);

  // Carrega agent
  const { data: agent } = await admin
    .from("agent_instances")
    .select(
      "id, status, telegram_bot_token_vault_id, telegram_bot_username, telegram_user_chat_id, railway_service_id, vps_pool_id",
    )
    .eq("id", agentId)
    .maybeSingle();

  if (!agent) return jsonResponse({ error: "agent não encontrado" }, 404);
  if (!agent.railway_service_id) {
    return jsonResponse({ error: "agente sem railway_service_id" }, 409);
  }
  if (!agent.telegram_bot_token_vault_id) {
    return jsonResponse({ error: "agente sem telegram bot token" }, 409);
  }

  // Resolve project/environment
  let projectId: string | null = null;
  let environmentId: string | null = null;
  if (agent.vps_pool_id) {
    const { data: pool } = await admin
      .from("vps_pool")
      .select("railway_project_id, railway_environment_id")
      .eq("id", agent.vps_pool_id)
      .maybeSingle();
    projectId = pool?.railway_project_id ?? null;
    environmentId = pool?.railway_environment_id ?? null;
  }
  if (!projectId || !environmentId) {
    const ctx = await getServiceContext({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
    });
    projectId = projectId ?? ctx.projectId;
    environmentId = environmentId ?? ctx.environmentId;
  }
  if (!projectId || !environmentId) {
    return jsonResponse({ error: "não foi possível resolver railway project/env" }, 500);
  }

  // Decifra token
  const { data: secret } = await admin.rpc("vault_decrypt_secret", {
    secret_id: agent.telegram_bot_token_vault_id,
  });
  // deno-lint-ignore no-explicit-any
  const token: string = (secret?.[0] as any)?.decrypted_secret ?? "";
  if (!token) return jsonResponse({ error: "falha ao decifrar token" }, 500);

  // 1) Suspende Hermes (libera getUpdates) — best effort
  try {
    await setHermesSuspended({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
      environmentId,
      projectId,
      suspended: true,
    });
    console.log(`[recover] Hermes suspenso, aguardando 25s para descer`);
  } catch (e) {
    console.warn("[recover] suspendHermes falhou:", e);
  }
  // Espera o redeploy de suspend efetivar (Hermes para de consumir updates)
  await new Promise((r) => setTimeout(r, 25_000));

  // Deleta webhook e dropa pending para garantir polling fresco
  await telegramApi(token, "deleteWebhook", { drop_pending_updates: false });

  // 2) Long-poll getUpdates — total até ~75s
  let ownerChatId: number | null = null;
  let ownerFirstName: string | null = null;
  let lastOffset = 0;
  const deadline = Date.now() + 75_000;

  while (Date.now() < deadline && !ownerChatId) {
    const remainingSec = Math.max(2, Math.floor((deadline - Date.now()) / 1000));
    const timeout = Math.min(20, remainingSec);
    const upd = await telegramApi<TelegramUpdate[]>(token, "getUpdates", {
      timeout,
      offset: lastOffset,
      allowed_updates: ["message"],
    });
    if (!upd.ok) {
      console.warn("[recover] getUpdates falhou:", upd);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    const updates = upd.result ?? [];
    for (const u of updates) {
      if (u.update_id >= lastOffset) lastOffset = u.update_id + 1;
      const m = u.message;
      if (!m?.chat || !m.from || m.from.is_bot) continue;
      if (m.chat.type && m.chat.type !== "private") continue;
      ownerChatId = m.chat.id;
      ownerFirstName = m.from.first_name ?? null;
      break;
    }
  }

  if (!ownerChatId) {
    // Retoma Hermes mesmo sem capturar
    try {
      await setHermesSuspended({
        token: RAILWAY_API_TOKEN,
        serviceId: agent.railway_service_id,
        environmentId,
        projectId,
        suspended: false,
      });
    } catch { /* ignore */ }
    return jsonResponse({
      found: false,
      hint: "Cliente não enviou mensagem na janela de 75s. Tente novamente.",
    }, 408);
  }

  // 3) Persiste chat_id no DB
  await admin
    .from("agent_instances")
    .update({
      telegram_user_chat_id: ownerChatId,
      telegram_first_message_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agent.id);

  // 4) Mensagem de confirmação ao cliente
  await telegramApi(token, "sendMessage", {
    chat_id: ownerChatId,
    text:
      `✅ Tudo certo${ownerFirstName ? `, ${ownerFirstName}` : ""}! Estou finalizando minha ativação. Em alguns instantes começo a conversar com você de verdade. ✨`,
  });

  // 5) Atualiza Railway env vars TELEGRAM_ALLOWED_USERS / HOME_CHANNEL + retira suspend
  const chatIdStr = String(ownerChatId);
  await upsertRailwayVariableCollection({
    token: RAILWAY_API_TOKEN,
    serviceId: agent.railway_service_id,
    environmentId,
    projectId,
    variables: {
      TELEGRAM_ALLOWED_USERS: chatIdStr,
      TELEGRAM_HOME_CHANNEL: chatIdStr,
      HERMES_SUSPENDED: "",
    },
    skipDeploys: true,
  });

  await deployRailwayService({
    token: RAILWAY_API_TOKEN,
    serviceId: agent.railway_service_id,
    environmentId,
  });

  // Volta status para active se estava suspended
  await admin
    .from("agent_instances")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", agent.id)
    .in("status", ["suspended", "active", "provisioning"]);

  return jsonResponse({
    found: true,
    chat_id: ownerChatId,
    first_name: ownerFirstName,
    redeployed: true,
  });
});
