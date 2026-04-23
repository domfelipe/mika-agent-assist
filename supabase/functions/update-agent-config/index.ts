// update-agent-config
// Atualiza variáveis de ambiente (SOUL, modelo, STT, TTS) de um agente já provisionado
// e dispara redeploy. Apenas admins podem chamar.
// verify_jwt = true: precisa de JWT válido + check de role admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  deployRailwayService,
  getServiceContext,
  upsertRailwayVariableCollection,
} from "../_shared/railway.ts";

interface RequestBody {
  agent_instance_id: string;
  agent_name?: string;
  soul_content: string;
  model: string;
  stt_provider: string;
  tts_provider: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!RAILWAY_API_TOKEN) {
    return jsonResponse(500, { error: "RAILWAY_API_TOKEN not configured" });
  }

  // 1) Auth: extrair JWT e validar admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse(401, { error: "missing authorization" });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: "invalid token" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr || !isAdmin) {
    return jsonResponse(403, { error: "admin role required" });
  }

  // 2) Validar body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!body.agent_instance_id) return jsonResponse(400, { error: "agent_instance_id required" });
  if (!body.soul_content || body.soul_content.length < 50) {
    return jsonResponse(400, { error: "soul_content too short (min 50 chars)" });
  }
  if (!body.model) return jsonResponse(400, { error: "model required" });

  // 3) Carregar agent + pool
  const { data: agent, error: agentErr } = await supabase
    .from("agent_instances")
    .select("id, railway_service_id, vps_pool_id, vps_pool:vps_pool_id(railway_project_id, railway_environment_id)")
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (agentErr || !agent) {
    return jsonResponse(404, { error: "agent_instance not found" });
  }
  if (!agent.railway_service_id) {
    return jsonResponse(409, { error: "agent has no railway_service_id — provision first" });
  }

  // deno-lint-ignore no-explicit-any
  const pool = (agent as any).vps_pool;
  let projectId: string | null = pool?.railway_project_id ?? null;
  let environmentId: string | null = pool?.railway_environment_id ?? null;

  if (!projectId || !environmentId) {
    const ctx = await getServiceContext({ token: RAILWAY_API_TOKEN, serviceId: agent.railway_service_id });
    projectId = projectId ?? ctx.projectId;
    environmentId = environmentId ?? ctx.environmentId;
  }

  if (!projectId || !environmentId) {
    return jsonResponse(500, { error: "failed to resolve railway project/environment" });
  }

  // 4) Upsert variáveis
  const variables: Record<string, string> = {
    HERMES_SOUL_OVERRIDE: body.soul_content,
    HERMES_MODEL: body.model,
    HERMES_FALLBACK_MODEL: "openrouter/google/gemma-4-31b-it",
    HERMES_STT_PROVIDER: body.stt_provider || "local",
    HERMES_TTS_PROVIDER: body.tts_provider || "disabled",
  };

  try {
    await upsertRailwayVariableCollection({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
      environmentId,
      projectId,
      variables,
    });

    await deployRailwayService({
      token: RAILWAY_API_TOKEN,
      serviceId: agent.railway_service_id,
      environmentId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("railway update failed:", msg);
    return jsonResponse(500, { error: "railway update failed", detail: msg });
  }

  // 5) Persistir model_config
  await supabase
    .from("agent_instances")
    .update({
      model_config: {
        provider: body.model,
        stt: body.stt_provider || "local",
        tts: body.tts_provider || "disabled",
        agent_name: body.agent_name ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", agent.id);

  return jsonResponse(200, { success: true, redeploying: true });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
