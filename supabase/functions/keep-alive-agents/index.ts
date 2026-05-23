// keep-alive-agents
// Mantém todos os containers Railway dos agentes ativos "acordados" e aproveita
// o ciclo para reconciliar o estado operacional dos cronjobs de volta no banco.
//
// Estratégia:
// 1. Faz GET /getMe no Telegram quando o agente já tem bot configurado
// 2. Puxa /api/cronjobs do runtime Hermes e atualiza scheduled_jobs
//
// Substitui completamente o UptimeRobot — não precisa de configuração externa
// por agente. Roda via pg_cron a cada 4 minutos.
//
// verify_jwt = false: chamado apenas pelo scheduler interno (pg_cron + pg_net).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeInternalRequest } from "../_shared/internal-auth.ts";
import { pullAgentCronjobsRuntimeState } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

interface AgentRow {
  id: string;
  user_id: string;
  railway_service_id: string | null;
  telegram_bot_token_vault_id: string | null;
  telegram_bot_username: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: aceita X-Internal-Secret (pg_cron) OU JWT de admin.
  const auth = await authorizeInternalRequest(req, { allowOwner: false });
  if (!auth.ok) {
    console.warn(`keep-alive: auth rejected (${auth.reason})`);
    return jsonResponse(401, { error: "unauthorized", reason: auth.reason });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Buscar agentes ativos; Telegram e runtime são tratados separadamente
  const { data: agents, error: agentsErr } = await supabase
    .from("agent_instances")
    .select("id, user_id, railway_service_id, telegram_bot_token_vault_id, telegram_bot_username")
    .eq("status", "active");

  if (agentsErr) {
    console.error("keep-alive: failed to load agents:", agentsErr.message);
    return jsonResponse(500, { error: "failed to load agents", detail: agentsErr.message });
  }

  const list = (agents ?? []) as AgentRow[];
  let telegramSuccess = 0;
  let telegramFailed = 0;
  let telegramSkipped = 0;
  let runtimeSyncSuccess = 0;
  let runtimeSyncFailed = 0;
  let runtimeSyncSkipped = 0;
  const runtimeSyncEnabled = Boolean(RAILWAY_API_TOKEN && HERMES_API_SERVER_KEY);

  // 2) Para cada agente, ping no Telegram + reconciliação de runtime
  await Promise.all(
    list.map(async (agent) => {
      if (agent.telegram_bot_token_vault_id) {
        try {
          const { data: secret, error: secretErr } = await supabase.rpc("vault_decrypt_secret", {
            secret_id: agent.telegram_bot_token_vault_id,
          });

          if (secretErr || !secret?.[0]?.decrypted_secret) {
            console.warn(`keep-alive: missing token for agent ${agent.id} (${agent.telegram_bot_username ?? "?"})`);
            telegramFailed++;
          } else {
            const token = secret[0].decrypted_secret as string;
            const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { method: "GET" });

            if (!res.ok) {
              const text = await res.text().catch(() => "");
              console.warn(`keep-alive: getMe failed for agent ${agent.id} (${agent.telegram_bot_username ?? "?"}): ${res.status} ${text.slice(0, 200)}`);
              telegramFailed++;
            } else {
              telegramSuccess++;
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`keep-alive: telegram exception for agent ${agent.id}: ${msg}`);
          telegramFailed++;
        }
      } else {
        telegramSkipped++;
      }

      if (!runtimeSyncEnabled || !agent.railway_service_id) {
        runtimeSyncSkipped++;
        return;
      }

      try {
        await pullAgentCronjobsRuntimeState({
          supabase,
          agentInstanceId: agent.id,
          railwayToken: RAILWAY_API_TOKEN,
          apiKey: HERMES_API_SERVER_KEY,
        });
        runtimeSyncSuccess++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`keep-alive: runtime sync exception for agent ${agent.id}: ${msg}`);
        runtimeSyncFailed++;
      }
    }),
  );

  const summary = {
    total: list.length,
    telegram_success: telegramSuccess,
    telegram_failed: telegramFailed,
    telegram_skipped: telegramSkipped,
    runtime_sync_enabled: runtimeSyncEnabled,
    runtime_sync_success: runtimeSyncSuccess,
    runtime_sync_failed: runtimeSyncFailed,
    runtime_sync_skipped: runtimeSyncSkipped,
  };
  console.log("keep-alive summary:", JSON.stringify(summary));
  return jsonResponse(200, summary);
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
