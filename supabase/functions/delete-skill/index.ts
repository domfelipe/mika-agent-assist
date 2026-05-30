// delete-skill (authenticated)
//
// Archives or deletes a Mika-managed skill through the server so the runtime is
// synchronized before the platform removes the source row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { syncAgentSkillsSnapshot } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

type DeleteSkillAction = "archive" | "delete";

interface DeleteSkillBody {
  skill_id?: string;
  action?: DeleteSkillAction;
}

interface SkillForDelete {
  id: string;
  user_id: string;
  agent_instance_id: string;
  name: string;
  status: string;
  is_default: boolean | null;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isValidAction(action: unknown): action is DeleteSkillAction {
  return action === "archive" || action === "delete";
}

async function syncSkills(
  // deno-lint-ignore no-explicit-any
  admin: any,
  agentInstanceId: string,
) {
  return await syncAgentSkillsSnapshot({
    supabase: admin,
    agentInstanceId,
    railwayToken: RAILWAY_API_TOKEN,
    apiKey: HERMES_API_SERVER_KEY,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse(401, { error: "missing authorization" });
  }

  let body: DeleteSkillBody;
  try {
    body = await req.json() as DeleteSkillBody;
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!body.skill_id) {
    return jsonResponse(400, { error: "skill_id required" });
  }

  const action = body.action ?? "archive";
  if (!isValidAction(action)) {
    return jsonResponse(400, { error: "invalid action" });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse(401, { error: "invalid token" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: skillData, error: skillErr } = await admin
    .from("skills")
    .select("id, user_id, agent_instance_id, name, status, is_default")
    .eq("id", body.skill_id)
    .maybeSingle();

  if (skillErr) {
    return jsonResponse(500, { error: "failed to load skill", detail: skillErr.message });
  }
  if (!skillData) {
    return jsonResponse(404, { error: "skill not found" });
  }

  const skill = skillData as SkillForDelete;
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) {
    return jsonResponse(500, { error: "failed to resolve role" });
  }

  if (skill.user_id !== userData.user.id && !isAdmin) {
    return jsonResponse(403, { error: "forbidden" });
  }

  if (skill.is_default) {
    return jsonResponse(403, { error: "default skills cannot be archived or deleted" });
  }

  if (skill.status !== "archived") {
    const { error: archiveErr } = await admin
      .from("skills")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", skill.id);

    if (archiveErr) {
      return jsonResponse(500, { error: "failed to archive skill", detail: archiveErr.message });
    }
  }

  let runtimeSyncWarning: string | null = null;
  try {
    await syncSkills(admin, skill.agent_instance_id);
  } catch (err) {
    runtimeSyncWarning = errorMessage(err);
    console.error("delete-skill runtime sync warning:", runtimeSyncWarning);
  }

  let deleted = false;
  if (action === "delete" && !runtimeSyncWarning) {
    const { error: deleteErr } = await admin
      .from("skills")
      .delete()
      .eq("id", skill.id);

    if (deleteErr) {
      runtimeSyncWarning = `DB delete failed after archive sync: ${deleteErr.message}`;
      console.error("delete-skill hard delete warning:", runtimeSyncWarning);
    } else {
      deleted = true;
    }
  }

  return jsonResponse(200, {
    success: true,
    skill_id: skill.id,
    agent_instance_id: skill.agent_instance_id,
    archived: true,
    deleted,
    runtime_sync_warning: runtimeSyncWarning,
  });
});
