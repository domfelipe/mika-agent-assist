// delete-cronjob (authenticated)
//
// Server-side deletion for Mika managed cronjobs. The flow intentionally avoids
// deleting the DB row before the runtime has received a safe state:
// 1) pause the job and sync, so the runtime stops executing it;
// 2) archive the job and sync again, so the runtime removes it;
// 3) hard-delete the archived row from Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "../_shared/cors.ts";
import { syncAgentCronjobsSnapshot } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

interface DeleteCronjobBody {
  job_id?: string;
}

interface ScheduledJobForDelete {
  id: string;
  user_id: string;
  agent_instance_id: string;
  name: string;
  status: string;
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

function truncateDetail(detail: string): string {
  return detail.slice(0, 2000);
}

async function markRuntimeSyncError(
  // deno-lint-ignore no-explicit-any
  admin: any,
  jobId: string,
  detail: string,
): Promise<void> {
  const { error } = await admin
    .from("scheduled_jobs")
    .update({
      runtime_state: "error",
      runtime_last_status: "error",
      runtime_last_error: truncateDetail(detail),
    })
    .eq("id", jobId);

  if (error) {
    console.error("delete-cronjob failed to persist runtime sync error:", error.message);
  }
}

async function syncCronjobs(
  // deno-lint-ignore no-explicit-any
  admin: any,
  agentInstanceId: string,
) {
  return await syncAgentCronjobsSnapshot({
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

  let body: DeleteCronjobBody;
  try {
    body = await req.json() as DeleteCronjobBody;
  } catch {
    return jsonResponse(400, { error: "invalid json body" });
  }

  if (!body.job_id) {
    return jsonResponse(400, { error: "job_id required" });
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

  const { data: jobData, error: jobErr } = await admin
    .from("scheduled_jobs")
    .select("id, user_id, agent_instance_id, name, status")
    .eq("id", body.job_id)
    .maybeSingle();

  if (jobErr) {
    return jsonResponse(500, { error: "failed to load cronjob", detail: jobErr.message });
  }
  if (!jobData) {
    return jsonResponse(404, { error: "cronjob not found" });
  }

  const job = jobData as ScheduledJobForDelete;
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) {
    return jsonResponse(500, { error: "failed to resolve role" });
  }

  if (job.user_id !== userData.user.id && !isAdmin) {
    return jsonResponse(403, { error: "forbidden" });
  }

  if (job.status !== "archived") {
    const { error: pauseErr } = await admin
      .from("scheduled_jobs")
      .update({
        status: "paused",
        auto_paused_reason: "Exclusão em andamento pelo usuário.",
        runtime_state: "paused",
        runtime_last_status: null,
        runtime_last_error: null,
        runtime_last_delivery_error: null,
      })
      .eq("id", job.id);

    if (pauseErr) {
      return jsonResponse(500, {
        error: "failed to pause cronjob before deletion",
        detail: pauseErr.message,
      });
    }

    try {
      await syncCronjobs(admin, job.agent_instance_id);
    } catch (err) {
      const detail = errorMessage(err);
      await markRuntimeSyncError(admin, job.id, detail);
      console.error("delete-cronjob pause sync failed:", detail);
      return jsonResponse(502, {
        error: "runtime pause sync failed",
        detail,
      });
    }
  }

  const { error: archiveErr } = await admin
    .from("scheduled_jobs")
    .update({
      status: "archived",
      auto_paused_reason: "Excluída pelo usuário.",
      runtime_state: "paused",
      runtime_last_status: null,
      runtime_last_error: null,
      runtime_last_delivery_error: null,
    })
    .eq("id", job.id);

  if (archiveErr) {
    return jsonResponse(500, {
      error: "failed to archive cronjob",
      detail: archiveErr.message,
    });
  }

  let runtimeSyncWarning: string | null = null;
  try {
    await syncCronjobs(admin, job.agent_instance_id);
  } catch (err) {
    runtimeSyncWarning = errorMessage(err);
    await markRuntimeSyncError(admin, job.id, runtimeSyncWarning);
    console.error("delete-cronjob archive sync warning:", runtimeSyncWarning);
  }

  let deleted = false;
  if (!runtimeSyncWarning) {
    const { error: deleteErr } = await admin
      .from("scheduled_jobs")
      .delete()
      .eq("id", job.id);

    if (deleteErr) {
      runtimeSyncWarning = `DB delete failed after archive sync: ${deleteErr.message}`;
      await markRuntimeSyncError(admin, job.id, runtimeSyncWarning);
      console.error("delete-cronjob hard delete warning:", runtimeSyncWarning);
    } else {
      deleted = true;
    }
  }

  return jsonResponse(200, {
    success: true,
    job_id: job.id,
    agent_instance_id: job.agent_instance_id,
    archived: true,
    deleted,
    runtime_sync_warning: runtimeSyncWarning,
  });
});
