// railway-webhook (público)
// Recebe eventos do Railway (Project Settings → Webhooks) sobre deploys.
// Quando um deployment SUCCESS bate em um railway_service_id que conhecemos,
// marcamos o agent_instance como 'active'.
//
// Railway envia payloads em formatos variados. Já vimos:
//   { type: "Deployment.deployed", details: { serviceId, status, ... }, resource: {...} }
//   { type: "DEPLOY", status, deployment: { serviceId, status, ... } }
// Aceitamos ambos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_BOT_TOKEN = Deno.env.get("ADMIN_TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");

async function notifyAdmin(message: string): Promise<void> {
  if (!ADMIN_TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${ADMIN_TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
  } catch (e) {
    console.error("notifyAdmin failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonResponse(200, { ignored: true, reason: "method not allowed" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    console.log("railway-webhook: invalid json body");
    return jsonResponse(200, { ignored: true, reason: "invalid json" });
  }

  console.log("railway-webhook: payload recebido", JSON.stringify(payload));

  // Extrai serviceId e status de qualquer um dos formatos conhecidos
  const deployment = (payload.deployment ?? {}) as Record<string, unknown>;
  const details = (payload.details ?? {}) as Record<string, unknown>;
  const resource = (payload.resource ?? {}) as Record<string, unknown>;
  const service = (payload.service ?? resource.service ?? {}) as Record<string, unknown>;

  const serviceId =
    (deployment.serviceId as string | undefined) ??
    (details.serviceId as string | undefined) ??
    (service.id as string | undefined) ??
    null;

  const status =
    (deployment.status as string | undefined) ??
    (details.status as string | undefined) ??
    (payload.status as string | undefined) ??
    null;

  if (!serviceId || !status) {
    console.log("railway-webhook: payload sem serviceId/status — ignorando");
    return jsonResponse(200, { ignored: true, reason: "missing serviceId/status" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agent } = await supabase
    .from("agent_instances")
    .select(
      "id, status, user_id, telegram_bot_username, railway_service_id, telegram_user_chat_id, telegram_bot_token_vault_id, agent_name, welcome_message_sent_at",
    )
    .eq("railway_service_id", serviceId)
    .maybeSingle();

  if (!agent) {
    console.log(`railway-webhook: serviceId ${serviceId} não corresponde a nenhum agent_instance`);
    return jsonResponse(200, { ignored: true, reason: "unknown serviceId" });
  }

  const now = new Date().toISOString();
  const upper = status.toUpperCase();
  const wasProvisioning = agent.status === "provisioning";

  // Carrega nome do cliente para a notificação (best-effort)
  async function loadFullName(): Promise<string> {
    if (!agent) return "—";
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", agent.user_id)
      .maybeSingle();
    return (data?.full_name as string | undefined) || "—";
  }

  if (upper === "SUCCESS" || upper === "ACTIVE" || upper === "DEPLOYED") {
    await supabase
      .from("agent_instances")
      .update({
        status: "active",
        provisioned_at: now,
        last_health_check_at: now,
      })
      .eq("id", agent.id);

    await supabase
      .from("provisioning_jobs")
      .update({ status: "completed", completed_at: now })
      .eq("agent_instance_id", agent.id)
      .in("status", ["running", "retrying", "pending"]);

    console.log(`railway-webhook: agent ${agent.id} marcado como active (status=${upper})`);

    // Envia mensagem de boas-vindas via Telegram (apenas na primeira ativação)
    if (
      !agent.welcome_message_sent_at &&
      agent.telegram_user_chat_id &&
      agent.telegram_bot_token_vault_id
    ) {
      try {
        await sendWelcomeMessage(supabase, agent);
      } catch (e) {
        console.error("railway-webhook: falha ao enviar welcome message:", e);
      }
    }

    // Notifica admin somente se era um auto-provisionamento (status anterior=provisioning)
    if (wasProvisioning) {
      const fullName = await loadFullName();
      await notifyAdmin(
        `✅ <b>Agente provisionado automaticamente!</b>\n\n` +
          `👤 <b>Cliente:</b> ${fullName}\n` +
          `🤖 <b>Bot:</b> @${agent.telegram_bot_username || "—"}\n` +
          `🚀 <b>Railway:</b> <code>${agent.railway_service_id}</code>\n\n` +
          `O cliente já pode conversar com a Mika no Telegram.`,
      );
    }

    return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "active" });
  }

  if (upper === "FAILED" || upper === "CRASHED") {
    await supabase
      .from("agent_instances")
      .update({ status: "error" })
      .eq("id", agent.id);

    await supabase
      .from("provisioning_jobs")
      .update({
        status: "failed",
        error_message: `Railway deployment ${upper}`,
        completed_at: now,
      })
      .eq("agent_instance_id", agent.id)
      .in("status", ["running", "retrying", "pending"]);

    console.log(`railway-webhook: agent ${agent.id} marcado como error (status=${upper})`);

    if (wasProvisioning) {
      const fullName = await loadFullName();
      await notifyAdmin(
        `❌ <b>Falha no deploy do agente</b>\n\n` +
          `👤 <b>Cliente:</b> ${fullName}\n` +
          `🚀 <b>Railway:</b> <code>${agent.railway_service_id}</code>\n` +
          `❗ <b>Status:</b> ${upper}\n\n` +
          `➡️ <a href="https://mika.domco.ai/admin">Investigar</a>`,
      );
    }

    return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "error" });
  }

  // BUILDING / DEPLOYING / outros — apenas log
  console.log(`railway-webhook: status ${upper} ignorado para agent ${agent.id}`);
  return jsonResponse(200, { ok: true, ignored_status: upper });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function sendWelcomeMessage(supabase: any, agent: any): Promise<void> {
  // Decifra o token do bot
  const { data: secret } = await supabase.rpc("vault_decrypt_secret", {
    secret_id: agent.telegram_bot_token_vault_id,
  });
  const token: string = secret?.[0]?.decrypted_secret ?? "";
  if (!token) {
    console.warn("sendWelcomeMessage: token vazio, abortando");
    return;
  }

  // Carrega first name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", agent.user_id)
    .maybeSingle();

  const fullName = (profile?.full_name as string | undefined)?.trim() || "";
  const firstName = fullName.split(" ")[0] || "você";
  const agentName = (agent.agent_name as string | undefined)?.trim() || "Mika";

  const text =
    `Olá, ${firstName}! 👋\n\n` +
    `Sou ${agentName}, sua assistente pessoal de IA criada pela DomCo.\n\n` +
    `Estou pronta para começar! Aqui estão algumas coisas que posso fazer por você:\n\n` +
    `📧 Resumir seus e-mails importantes\n` +
    `📅 Gerenciar sua agenda\n` +
    `✅ Organizar suas tarefas\n` +
    `🔍 Pesquisar qualquer coisa\n` +
    `⚡ Criar automações personalizadas\n\n` +
    `Pode me mandar uma mensagem quando quiser. Estou aqui! 🚀`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: agent.telegram_user_chat_id,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`sendWelcomeMessage: Telegram API ${res.status}: ${err}`);
    return;
  }

  await supabase
    .from("agent_instances")
    .update({ welcome_message_sent_at: new Date().toISOString() })
    .eq("id", agent.id);

  console.log(`sendWelcomeMessage: enviada para agent ${agent.id}`);
}
