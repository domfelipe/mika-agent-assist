import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { syncAgentRuntimeSnapshot } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

type RuntimeSyncScope = "cronjobs" | "integrations" | "all";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidScope(scope: unknown): scope is RuntimeSyncScope {
  return scope === "cronjobs" || scope === "integrations" || scope === "all";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse(401, { error: "missing authorization" });
  }

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

  let body: { agent_instance_id?: string; scope?: RuntimeSyncScope };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!body.agent_instance_id) {
    return jsonResponse(400, { error: "agent_instance_id required" });
  }

  if (body.scope && !isValidScope(body.scope)) {
    return jsonResponse(400, { error: "invalid scope" });
  }

  const { data: agent, error: agentErr } = await supabase
    .from("agent_instances")
    .select("id, user_id")
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (agentErr || !agent) {
    return jsonResponse(404, { error: "agent_instance not found" });
  }

  const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) {
    return jsonResponse(500, { error: "failed to resolve role" });
  }

  if (agent.user_id !== userData.user.id && !isAdmin) {
    return jsonResponse(403, { error: "forbidden" });
  }

  try {
    const result = await syncAgentRuntimeSnapshot({
      supabase,
      agentInstanceId: agent.id,
      railwayToken: RAILWAY_API_TOKEN,
      apiKey: HERMES_API_SERVER_KEY,
      scope: body.scope ?? "all",
    });

    return jsonResponse(200, {
      success: true,
      agent_instance_id: result.agent_instance_id,
      public_url: result.public_url,
      public_domain: result.public_domain,
      cronjobs_synced_count: result.cronjobs_synced_count,
      integrations_synced_count: result.integrations_synced_count,
      runtime_responses: result.responses,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("sync-agent-runtime failed:", detail);
    return jsonResponse(500, { error: "runtime sync failed", detail });
  }
});
