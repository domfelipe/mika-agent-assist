// resume-agent
// Retoma o serviço Hermes removendo HERMES_SUSPENDED (string vazia) e disparando redeploy.
// Disparado automaticamente quando subscription volta para active/trialing,
// ou manualmente pelo painel admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeInternalRequest } from "../_shared/internal-auth.ts";
import { setHermesSuspended, getServiceContext } from "../_shared/railway.ts";

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
    .select("id, status, railway_service_id, vps_pool_id, user_id")
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (!agent) return jsonResponse(404, { error: "agent_instance not found" });

  // Auth: X-Internal-Secret (trigger), JWT de admin, OU JWT do dono do agente.
  const auth = await authorizeInternalRequest(req, { ownerUserId: agent.user_id });
  if (!auth.ok) {
    console.warn(`resume-agent: auth rejected (${auth.reason})`);
    return jsonResponse(401, { error: "unauthorized", reason: auth.reason });
  }


  if (!agent.railway_service_id) {
    return jsonResponse(409, {
      error: "agent has no container — needs full provisioning instead",
    });
  }

  if (agent.status === "active") {
    return jsonResponse(200, { ok: true, already_active: true });
  }

  // Resolve environmentId/projectId
  let environmentId: string | null = null;
  let projectId: string | undefined;
  if (agent.vps_pool_id) {
    const { data: pool } = await supabase
      .from("vps_pool")
      .select("railway_environment_id, railway_project_id")
      .eq("id", agent.vps_pool_id)
      .maybeSingle();
    environmentId = pool?.railway_environment_id ?? null;
    projectId = pool?.railway_project_id ?? undefined;
  }
  if (!environmentId || !projectId) {
    const ctx = await getServiceContext({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
    });
    environmentId = environmentId ?? ctx.environmentId;
    projectId = projectId ?? ctx.projectId ?? undefined;
  }
  if (!environmentId || !projectId) {
    return jsonResponse(500, { error: "could not resolve railway environmentId/projectId" });
  }

  try {
    await setHermesSuspended({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
      environmentId,
      projectId,
      suspend: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("resume-agent: setHermesSuspended failed:", msg);
    return jsonResponse(500, { error: "railway resume failed", detail: msg });
  }

  await supabase
    .from("agent_instances")
    .update({ status: "active", last_health_check_at: new Date().toISOString() })
    .eq("id", agent.id);

  return jsonResponse(200, { ok: true, agent_id: agent.id, new_status: "active" });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
