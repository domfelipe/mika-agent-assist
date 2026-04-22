// suspend-agent
// Pausa o serviço Railway (numReplicas=0) e marca agent_instance.status='suspended'.
// Disparado automaticamente quando subscription muda para canceled/past_due/unpaid/paused,
// ou manualmente pelo painel admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { setRailwayReplicas } from "../_shared/railway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");

interface RequestBody {
  agent_instance_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!RAILWAY_API_TOKEN) {
    return jsonResponse(500, { error: "RAILWAY_API_TOKEN not configured" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!body.agent_instance_id) {
    return jsonResponse(400, { error: "agent_instance_id required" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agent } = await supabase
    .from("agent_instances")
    .select("id, status, railway_service_id, vps_pool_id")
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (!agent) return jsonResponse(404, { error: "agent_instance not found" });
  if (agent.status === "suspended") {
    return jsonResponse(200, { ok: true, already_suspended: true });
  }
  if (!agent.railway_service_id || !agent.vps_pool_id) {
    // Sem container provisionado ainda — só marca o status
    await supabase
      .from("agent_instances")
      .update({ status: "suspended" })
      .eq("id", agent.id);
    return jsonResponse(200, { ok: true, no_container: true });
  }

  const { data: pool } = await supabase
    .from("vps_pool")
    .select("railway_environment_id")
    .eq("id", agent.vps_pool_id)
    .maybeSingle();

  if (!pool?.railway_environment_id) {
    return jsonResponse(500, { error: "pool environment not configured" });
  }

  try {
    await setRailwayReplicas({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
      environmentId: pool.railway_environment_id,
      replicas: 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("suspend-agent: setRailwayReplicas failed:", msg);
    return jsonResponse(500, { error: "railway scale-down failed", detail: msg });
  }

  await supabase
    .from("agent_instances")
    .update({ status: "suspended" })
    .eq("id", agent.id);

  return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "suspended" });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
