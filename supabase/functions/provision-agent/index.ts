// provision-agent
// Cria um serviço Docker no Railway para um agent_instance que entrou em status='provisioning'.
// Chamado automaticamente pelo trigger pg_net OU manualmente pelo painel admin.
// verify_jwt = false: o trigger pg_net usa anon key como Bearer, sem JWT de usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createRailwayService,
  configureRailwayService,
  deployRailwayService,
  deleteTelegramWebhook,
} from "../_shared/railway.ts";

interface RequestBody {
  agent_instance_id: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");
const OPENCODE_ZEN_API_KEY = Deno.env.get("OPENCODE_ZEN_API_KEY") ?? "";
const OPENCODE_GO_API_KEY = Deno.env.get("OPENCODE_GO_API_KEY") ?? "";

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

  // 1) Carregar agent_instance + profile
  const { data: agent, error: agentErr } = await supabase
    .from("agent_instances")
    .select(
      "id, user_id, uuid_tenant, status, telegram_bot_token_vault_id, telegram_bot_username, railway_service_id",
    )
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (agentErr || !agent) {
    return jsonResponse(404, { error: "agent_instance not found", detail: agentErr?.message });
  }

  if (agent.status !== "provisioning") {
    return jsonResponse(409, { error: "agent_instance is not in provisioning status", status: agent.status });
  }

  if (agent.railway_service_id) {
    return jsonResponse(409, { error: "agent_instance already has a railway_service_id", railway_service_id: agent.railway_service_id });
  }

  // 2) Buscar pool disponível (com IDs Railway preenchidos e capacidade)
  const { data: pool, error: poolErr } = await supabase
    .from("vps_pool")
    .select("id, railway_project_id, railway_environment_id, capacity_max, capacity_current")
    .eq("is_active", true)
    .neq("railway_project_id", "PREENCHER_APOS_CRIAR_NO_RAILWAY")
    .lt("capacity_current", 10000)
    .order("capacity_current", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (poolErr || !pool || !pool.railway_project_id || !pool.railway_environment_id) {
    await failJob(supabase, agent, null, "Nenhum vps_pool com Railway IDs configurados disponível");
    return jsonResponse(503, { error: "no railway pool available" });
  }

  // 3) Criar provisioning_job em status running
  const { data: job, error: jobErr } = await supabase
    .from("provisioning_jobs")
    .insert({
      agent_instance_id: agent.id,
      user_id: agent.user_id,
      vps_pool_id: pool.id,
      status: "running",
      attempt: 1,
      started_at: new Date().toISOString(),
      payload: { uuid_tenant: agent.uuid_tenant, telegram_bot_username: agent.telegram_bot_username },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    return jsonResponse(500, { error: "failed to create provisioning_job", detail: jobErr?.message });
  }

  // 4) Decrypt do telegram_bot_token (se existir)
  let telegramToken = "";
  if (agent.telegram_bot_token_vault_id) {
    const { data: secret } = await supabase.rpc("vault_decrypt_secret", {
      secret_id: agent.telegram_bot_token_vault_id,
    });
    telegramToken = secret?.[0]?.decrypted_secret ?? "";
  }

  if (!telegramToken) {
    await failJob(supabase, agent, job.id, "telegram_bot_token ausente no Vault — usuário precisa concluir onboarding antes");
    return jsonResponse(412, { error: "telegram token missing" });
  }

  // 5) Apagar webhook Telegram (Hermes vai usar polling)
  try {
    await deleteTelegramWebhook(telegramToken);
  } catch (e) {
    console.warn("deleteTelegramWebhook failed (continuing):", String(e));
  }

  // 6) Criar serviço no Railway
  const serviceName = `mika-${agent.uuid_tenant.replace(/-/g, "").slice(0, 8)}`;
  let railwayServiceId: string;

  try {
    railwayServiceId = await createRailwayService({
      token: RAILWAY_API_TOKEN,
      projectId: pool.railway_project_id,
      name: serviceName,
    });

    await configureRailwayService({
      token: RAILWAY_API_TOKEN,
      serviceId: railwayServiceId,
      environmentId: pool.railway_environment_id,
      image: "nousresearch/hermes-agent:latest",
      variables: {
        TELEGRAM_BOT_TOKEN: telegramToken,
        TELEGRAM_ALLOWED_USERS: "",
        API_SERVER_ENABLED: "false",
        HERMES_HOME: "/root/.hermes",
        MAIN_MODEL_PROVIDER: "opencode-zen",
        OPENCODE_ZEN_API_KEY,
        OPENCODE_GO_API_KEY,
        HERMES_GATEWAY_CMD: "true",
      },
    });

    await deployRailwayService({
      token: RAILWAY_API_TOKEN,
      serviceId: railwayServiceId,
      environmentId: pool.railway_environment_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Railway provisioning failed:", msg);
    await scheduleRetry(supabase, agent, job.id, msg);
    return jsonResponse(500, { error: "railway provisioning failed", detail: msg });
  }

  // 7) Persistir railway_service_id no agent_instance e no job
  await supabase
    .from("agent_instances")
    .update({ railway_service_id: railwayServiceId, vps_pool_id: pool.id })
    .eq("id", agent.id);

  await supabase
    .from("provisioning_jobs")
    .update({ railway_service_id: railwayServiceId })
    .eq("id", job.id);

  // status permanece 'provisioning' — o railway-webhook atualiza para 'active' quando o deploy subir
  return jsonResponse(200, {
    success: true,
    agent_instance_id: agent.id,
    railway_service_id: railwayServiceId,
    job_id: job.id,
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function failJob(
  supabase: ReturnType<typeof createClient>,
  agent: { id: string },
  jobId: string | null,
  message: string,
) {
  if (jobId) {
    await supabase
      .from("provisioning_jobs")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", jobId);
  }
  await supabase.from("agent_instances").update({ status: "error" }).eq("id", agent.id);
}

async function scheduleRetry(
  supabase: ReturnType<typeof createClient>,
  agent: { id: string },
  jobId: string,
  message: string,
) {
  // Lê a tentativa atual
  const { data: job } = await supabase
    .from("provisioning_jobs")
    .select("attempt, max_attempts")
    .eq("id", jobId)
    .single();

  const attempt = job?.attempt ?? 1;
  const max = job?.max_attempts ?? 5;

  if (attempt >= max) {
    await failJob(supabase, agent, jobId, `Max attempts reached. Last error: ${message}`);
    return;
  }

  const nextDelayMs = Math.pow(attempt, 2) * 60_000; // attempt^2 minutos
  const nextRetryAt = new Date(Date.now() + nextDelayMs).toISOString();

  await supabase
    .from("provisioning_jobs")
    .update({
      status: "retrying",
      attempt: attempt + 1,
      error_message: message,
      next_retry_at: nextRetryAt,
    })
    .eq("id", jobId);
}
