// keep-alive-agents
// Mantém todos os containers Railway dos agentes ativos "acordados" fazendo
// uma request GET /getMe ao Telegram para cada agente. Isso força tráfego de
// saída no container, evitando que o Railway hiberne instâncias ociosas.
//
// Substitui completamente o UptimeRobot — não precisa de configuração externa
// por agente. Roda via pg_cron a cada 4 minutos.
//
// verify_jwt = false: chamado apenas pelo scheduler interno (pg_cron + pg_net).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AgentRow {
  id: string;
  user_id: string;
  telegram_bot_token_vault_id: string;
  telegram_bot_username: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Buscar agentes ativos com token configurado
  const { data: agents, error: agentsErr } = await supabase
    .from("agent_instances")
    .select("id, user_id, telegram_bot_token_vault_id, telegram_bot_username")
    .eq("status", "active")
    .not("telegram_bot_token_vault_id", "is", null);

  if (agentsErr) {
    console.error("keep-alive: failed to load agents:", agentsErr.message);
    return jsonResponse(500, { error: "failed to load agents", detail: agentsErr.message });
  }

  const list = (agents ?? []) as AgentRow[];
  let success = 0;
  let failed = 0;

  // 2) Para cada agente, decrypt token + GET /getMe (em paralelo, mas sem quebrar o loop)
  await Promise.all(
    list.map(async (agent) => {
      try {
        const { data: secret, error: secretErr } = await supabase.rpc("vault_decrypt_secret", {
          secret_id: agent.telegram_bot_token_vault_id,
        });

        if (secretErr || !secret?.[0]?.decrypted_secret) {
          console.warn(`keep-alive: missing token for agent ${agent.id} (${agent.telegram_bot_username ?? "?"})`);
          failed++;
          return;
        }

        const token = secret[0].decrypted_secret as string;
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { method: "GET" });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(`keep-alive: getMe failed for agent ${agent.id} (${agent.telegram_bot_username ?? "?"}): ${res.status} ${text.slice(0, 200)}`);
          failed++;
          return;
        }

        success++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`keep-alive: exception for agent ${agent.id}: ${msg}`);
        failed++;
      }
    }),
  );

  const summary = { total: list.length, success, failed };
  console.log("keep-alive summary:", JSON.stringify(summary));
  return jsonResponse(200, summary);
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
