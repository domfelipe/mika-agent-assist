// admin-backfill-runtime
// Admin-only. Para cada agent_instance com railway_service_id, reaplica:
//   - HERMES_RUNTIME_IMAGE (imagem corrigida)
//   - API_SERVER_PORT=8765
//   - envs MIKA_* / HERMES_* obrigatórias do contrato runtime
// e dispara redeploy no Railway. NÃO recria serviço, NÃO toca tokens sensíveis
// (TELEGRAM_BOT_TOKEN, OLLAMA_API_KEY etc). Sempre roda em modo dry_run por padrão.
//
// POST body:
//   { dry_run?: boolean (default true), agent_instance_id?: string }
//
// Resposta: relatório por instância com status ok|skipped|error.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { authorizeInternalRequest } from "../_shared/internal-auth.ts";
import {
  HERMES_START_COMMAND,
  configureRailwayService,
  deployRailwayService,
  getServiceContext,
  upsertRailwayVariableCollection,
} from "../_shared/railway.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const HERMES_RUNTIME_IMAGE =
  Deno.env.get("HERMES_RUNTIME_IMAGE") ?? "ghcr.io/domfelipe/hermes-agent-custom:latest";
const MIKA_RUNTIME_CONTRACT_VERSION = "2026-05-28";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildBackfillEnv(agentInstanceId: string): Record<string, string> {
  const functionsBaseUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1`;
  const createCronjobUrl = `${functionsBaseUrl}/create-cronjob-from-agent`;
  const createSkillUrl = `${functionsBaseUrl}/create-skill-from-agent`;

  return {
    AGENT_INSTANCE_ID: agentInstanceId,
    API_SERVER_PORT: "8765",
    HERMES_AGENT_INSTANCE_ID: agentInstanceId,
    HERMES_CREATE_CRONJOB_URL: createCronjobUrl,
    HERMES_CREATE_SKILL_URL: createSkillUrl,
    HERMES_INTERNAL_FUNCTION_SECRET: INTERNAL_FUNCTION_SECRET,
    HERMES_PLATFORM_FUNCTIONS_BASE_URL: functionsBaseUrl,
    HERMES_RUNTIME_CONTRACT_VERSION: MIKA_RUNTIME_CONTRACT_VERSION,
    INTERNAL_FUNCTION_SECRET,
    MIKA_AGENT_INSTANCE_ID: agentInstanceId,
    MIKA_CREATE_CRONJOB_URL: createCronjobUrl,
    MIKA_CREATE_SKILL_URL: createSkillUrl,
    MIKA_INTERNAL_FUNCTION_SECRET: INTERNAL_FUNCTION_SECRET,
    MIKA_PLATFORM_FUNCTIONS_BASE_URL: functionsBaseUrl,
    MIKA_RUNTIME_CONTRACT_VERSION,
    SUPABASE_URL,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorizeInternalRequest(req, { allowOwner: false });
  if (!auth.ok) {
    return jsonResponse(401, { error: "unauthorized", reason: auth.reason });
  }
  // Apenas via X-Internal-Secret OU admin JWT
  if (!auth.viaSecret && !auth.isAdmin) {
    return jsonResponse(403, { error: "admin only" });
  }

  if (!RAILWAY_API_TOKEN) {
    return jsonResponse(500, { error: "RAILWAY_API_TOKEN not configured" });
  }

  let body: { dry_run?: boolean; agent_instance_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  const dryRun = body.dry_run !== false; // default true
  const filterId = body.agent_instance_id;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("agent_instances")
    .select("id, user_id, status, railway_service_id, vps_pool_id, agent_name")
    .not("railway_service_id", "is", null)
    .in("status", ["active", "provisioning"]);

  if (filterId) query = query.eq("id", filterId);

  const { data: agents, error: agentsErr } = await query;
  if (agentsErr) {
    return jsonResponse(500, { error: "failed to list agents", detail: agentsErr.message });
  }

  console.log(
    `[admin-backfill-runtime] dry_run=${dryRun} target_count=${agents?.length ?? 0} image=${HERMES_RUNTIME_IMAGE}`,
  );

  const report: Array<Record<string, unknown>> = [];

  for (const agent of agents ?? []) {
    const entry: Record<string, unknown> = {
      agent_instance_id: agent.id,
      railway_service_id: agent.railway_service_id,
      agent_name: agent.agent_name,
      status: "pending",
    };

    try {
      // Resolver project/environment
      let projectId: string | null = null;
      let environmentId: string | null = null;

      if (agent.vps_pool_id) {
        const { data: pool } = await supabase
          .from("vps_pool")
          .select("railway_project_id, railway_environment_id")
          .eq("id", agent.vps_pool_id)
          .maybeSingle();
        projectId = (pool?.railway_project_id as string | null) ?? null;
        environmentId = (pool?.railway_environment_id as string | null) ?? null;
      }

      if (!projectId || !environmentId) {
        const ctx = await getServiceContext({
          token: RAILWAY_API_TOKEN,
          serviceId: agent.railway_service_id as string,
        });
        projectId = projectId ?? ctx.projectId;
        environmentId = environmentId ?? ctx.environmentId;
      }

      if (!projectId || !environmentId) {
        entry.status = "error";
        entry.error = "could not resolve railway project/environment";
        report.push(entry);
        continue;
      }

      const variables = buildBackfillEnv(agent.id);
      entry.variables_count = Object.keys(variables).length;
      entry.image = HERMES_RUNTIME_IMAGE;

      if (dryRun) {
        entry.status = "dry_run";
        entry.would_apply = Object.keys(variables);
        report.push(entry);
        continue;
      }

      // 1) upsert envs (sem disparar deploy ainda)
      await upsertRailwayVariableCollection({
        token: RAILWAY_API_TOKEN,
        serviceId: agent.railway_service_id as string,
        environmentId,
        projectId,
        variables,
        skipDeploys: true,
      });

      // 2) reconciliar imagem + start command
      await configureRailwayService({
        token: RAILWAY_API_TOKEN,
        serviceId: agent.railway_service_id as string,
        environmentId,
        projectId,
        image: HERMES_RUNTIME_IMAGE,
        variables: {},
        startCommand: HERMES_START_COMMAND,
      });

      // 3) deploy from source para puxar a imagem reconciliada, não o último deploy antigo
      await deployRailwayService({
        token: RAILWAY_API_TOKEN,
        serviceId: agent.railway_service_id as string,
        environmentId,
        fromSource: true,
      });

      entry.status = "ok";
    } catch (e) {
      entry.status = "error";
      entry.error = e instanceof Error ? e.message : String(e);
      console.error(`[admin-backfill-runtime] erro em ${agent.id}:`, entry.error);
    }

    report.push(entry);
  }

  const summary = {
    dry_run: dryRun,
    image: HERMES_RUNTIME_IMAGE,
    total: report.length,
    ok: report.filter((r) => r.status === "ok").length,
    dry: report.filter((r) => r.status === "dry_run").length,
    errors: report.filter((r) => r.status === "error").length,
  };
  console.log(`[admin-backfill-runtime] summary=${JSON.stringify(summary)}`);

  return jsonResponse(200, { summary, report });
});
