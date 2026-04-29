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
  getServiceContext,
  findRailwayServiceByName,
  upsertRailwayVariableCollection,
} from "../_shared/railway.ts";

interface RequestBody {
  agent_instance_id: string;
  agent_name?: string;
  soul_content?: string;
  model?: string;
  stt_provider?: string;
  tts_provider?: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN");

const ADMIN_TELEGRAM_BOT_TOKEN = Deno.env.get("ADMIN_TELEGRAM_BOT_TOKEN");
const ADMIN_TELEGRAM_CHAT_ID = Deno.env.get("ADMIN_TELEGRAM_CHAT_ID");

async function notifyAdmin(message: string): Promise<void> {
  if (!ADMIN_TELEGRAM_BOT_TOKEN || !ADMIN_TELEGRAM_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${ADMIN_TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
        }),
      },
    );
  } catch (e) {
    console.error("notifyAdmin failed:", e);
  }
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

  console.log(`[provision-agent] início para agent_instance_id=${body.agent_instance_id}`);

  // 1) Carregar agent_instance
  const { data: agent, error: agentErr } = await supabase
    .from("agent_instances")
    .select(
      "id, user_id, uuid_tenant, status, telegram_bot_token_vault_id, telegram_bot_username, telegram_user_chat_id, railway_service_id, agent_name",
    )
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (agentErr || !agent) {
    console.error(`[provision-agent] agent_instance não encontrado: ${agentErr?.message}`);
    return jsonResponse(404, { error: "agent_instance not found", detail: agentErr?.message });
  }

  if (agent.status !== "provisioning") {
    console.log(`[provision-agent] status atual=${agent.status}, abortando`);
    return jsonResponse(409, { error: "agent_instance is not in provisioning status", status: agent.status });
  }

  // Se já existe railway_service_id → fluxo de UPDATE (não tenta criar novo serviço)
  if (agent.railway_service_id) {
    console.log(`[provision-agent] railway_service_id já existe (${agent.railway_service_id}) → modo update`);
    return await handleUpdateExistingService(supabase, agent, body);
  }

  // 1b) Carregar profile (full_name → nome do agente)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", agent.user_id)
    .maybeSingle();

  const fullName = (profile?.full_name?.trim() || "Usuário").toString();
  const firstName = fullName.split(" ")[0] || "Usuário";
  // Prioridade: body > coluna agent_name no DB > default "Mika de {firstName}"
  const agentName =
    body.agent_name?.trim() ||
    (agent.agent_name?.trim() ?? "") ||
    `Mika de ${firstName}`;
  console.log(`[provision-agent] profile carregado: ${fullName} → agent_name=${agentName}`);

  // 1c) Carregar subscription ativa (para definir modelo Pro vs Basic)
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id, status, plans(slug)")
    .eq("user_id", agent.user_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const planSlug = ((subscription as any)?.plans?.slug as string | undefined) ?? "basic";
  const isPro = ["professional", "enterprise"].includes(planSlug);
  console.log(`[provision-agent] plano=${planSlug} isPro=${isPro}`);

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
    console.error(`[provision-agent] sem vps_pool disponível: ${poolErr?.message}`);
    await failJob(supabase, agent, null, "Nenhum vps_pool com Railway IDs configurados disponível");
    await notifyAdmin(
      `❌ <b>Falha no auto-provisionamento</b>\n\n` +
        `👤 <b>Cliente:</b> ${fullName}\n` +
        `❗ <b>Erro:</b> Nenhum vps_pool disponível\n\n` +
        `➡️ <a href="https://mika.domco.ai/admin">Resolver manualmente</a>`,
    );
    return jsonResponse(503, { error: "no railway pool available" });
  }
  console.log(`[provision-agent] pool selecionado: ${pool.id} (railway_project=${pool.railway_project_id})`);

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
      payload: {
        uuid_tenant: agent.uuid_tenant,
        telegram_bot_username: agent.telegram_bot_username,
        plan_slug: planSlug,
        agent_name: agentName,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error(`[provision-agent] falha ao criar job: ${jobErr?.message}`);
    return jsonResponse(500, { error: "failed to create provisioning_job", detail: jobErr?.message });
  }
  console.log(`[provision-agent] provisioning_job criado: ${job.id}`);

  // 4) Decrypt do telegram_bot_token (se existir)
  let telegramBotToken = "";
  if (agent.telegram_bot_token_vault_id) {
    console.log(`[provision-agent] decifrando token do Vault: ${agent.telegram_bot_token_vault_id}`);
    const { data: secret } = await supabase.rpc("vault_decrypt_secret", {
      secret_id: agent.telegram_bot_token_vault_id,
    });
    telegramBotToken = secret?.[0]?.decrypted_secret ?? "";
  }

  if (!telegramBotToken) {
    console.error(`[provision-agent] telegram_bot_token ausente — usuário ainda não conectou bot`);
    await failJob(supabase, agent, job.id, "telegram_bot_token ausente no Vault — usuário precisa concluir onboarding antes");
    return jsonResponse(412, { error: "telegram token missing" });
  }
  console.log(`[provision-agent] token Telegram OK (len=${telegramBotToken.length})`);

  // 5) Apagar webhook Telegram (Hermes vai usar polling)
  try {
    await deleteTelegramWebhook(telegramBotToken);
    console.log(`[provision-agent] deleteTelegramWebhook OK`);
  } catch (e) {
    console.warn("[provision-agent] deleteTelegramWebhook failed (continuing):", String(e));
  }

  // 6) Montar variáveis de ambiente do container (imagem custom já contém SOUL.md)
  const sttProvider = body.stt_provider || "local";
  const ttsProvider = body.tts_provider || "disabled";
  const hasChatId = !!agent.telegram_user_chat_id;
  const chatIdStr = hasChatId ? String(agent.telegram_user_chat_id) : "";

  const defaultSoul = `Você se chama ${agentName}. Você é um assistente pessoal de IA criado pela DomCo. exclusivamente para ${fullName}. Seu estilo: Direto e objetivo, sempre em português brasileiro, respostas curtas no Telegram, use emojis com moderação, trate ${firstName} pelo primeiro nome. Suas prioridades: produtividade, automação proativa. Identidade: você é ${agentName} da DomCo., nunca se identifique como Hermes ou qualquer outro modelo.`;
  const soulContent = body.soul_content?.trim() || defaultSoul;

  const envVars: Record<string, string> = {
    HERMES_HOME: "/opt/data/.hermes",
    API_SERVER_ENABLED: "true",
    API_SERVER_KEY: Deno.env.get("HERMES_API_SERVER_KEY") ?? "",
    GATEWAY_ALLOW_ALL_USERS: "false",
    HERMES_SOUL_OVERRIDE: soulContent,
    HERMES_STT_PROVIDER: sttProvider,
    HERMES_TTS_PROVIDER: ttsProvider,
    OLLAMA_API_KEY: Deno.env.get("OLLAMA_API_KEY") ?? "",
    PORT: "8642",
    TELEGRAM_ALLOWED_USERS: chatIdStr,
    TELEGRAM_BOT_TOKEN: telegramBotToken,
    TELEGRAM_HOME_CHANNEL: chatIdStr,
  };

  // Modelo é definido pelo config.yaml embutido na imagem custom (ollama-cloud + gemma4:31b-cloud).
  // NÃO injetar HERMES_MODEL como env var — sobrescreve o config.yaml e quebra o bot.
  const agentNameFinal = agentName;
  const modelFinal = isPro ? "ollama-cloud/gemma4:31b-cloud" : "ollama-cloud/gemma4:31b-cloud";

  // 7) Criar serviço no Railway
  const serviceName = `mika-${agent.uuid_tenant.replace(/-/g, "").slice(0, 8)}`;
  console.log(`[provision-agent] criando serviço Railway: ${serviceName}`);
  let railwayServiceId: string;

  try {
    try {
      railwayServiceId = await createRailwayService({
        token: RAILWAY_API_TOKEN,
        projectId: pool.railway_project_id,
        name: serviceName,
      });
      console.log(`[provision-agent] serviço criado: ${railwayServiceId}`);
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      // Recover from "service already exists" — provavelmente sobra de attempt anterior
      if (msg.includes("already exists")) {
        console.warn(`[provision-agent] serviço já existe, tentando recuperar ID por nome: ${serviceName}`);
        const existingId = await findRailwayServiceByName({
          token: RAILWAY_API_TOKEN,
          projectId: pool.railway_project_id,
          name: serviceName,
        });
        if (!existingId) {
          throw new Error(`Service "${serviceName}" exists but could not be located via API`);
        }
        railwayServiceId = existingId;
        console.log(`[provision-agent] serviço existente recuperado: ${railwayServiceId}`);
      } else {
        throw createErr;
      }
    }

    await configureRailwayService({
      token: RAILWAY_API_TOKEN,
      serviceId: railwayServiceId,
      environmentId: pool.railway_environment_id,
      projectId: pool.railway_project_id,
      image: "ghcr.io/domfelipe/hermes-agent-custom:latest",
      variables: envVars,
    });
    console.log(`[provision-agent] serviço configurado com ${Object.keys(envVars).length} env vars`);

    await deployRailwayService({
      token: RAILWAY_API_TOKEN,
      serviceId: railwayServiceId,
      environmentId: pool.railway_environment_id,
    });
    console.log(`[provision-agent] deploy disparado em Railway`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[provision-agent] Railway provisioning failed:", msg);
    const reachedMax = await scheduleRetry(supabase, agent, job.id, msg);
    if (reachedMax) {
      await notifyAdmin(
        `❌ <b>Falha no auto-provisionamento</b>\n\n` +
          `👤 <b>Cliente:</b> ${fullName}\n` +
          `❗ <b>Erro:</b> ${msg}\n\n` +
          `➡️ <a href="https://mika.domco.ai/admin">Provisionar manualmente</a>`,
      );
    }
    return jsonResponse(500, { error: "railway provisioning failed", detail: msg });
  }

  // 8) Persistir railway_service_id no agent_instance e no job (status='running')
  await supabase
    .from("agent_instances")
    .update({
      railway_service_id: railwayServiceId,
      vps_pool_id: pool.id,
      agent_name: agentNameFinal,
      model_config: {
        provider: modelFinal,
        stt: sttProvider,
        tts: ttsProvider,
        agent_name: agentNameFinal,
      },
    })
    .eq("id", agent.id);

  await supabase
    .from("provisioning_jobs")
    .update({ railway_service_id: railwayServiceId, status: "running" })
    .eq("id", job.id);

  console.log(`[provision-agent] sucesso: agent=${agent.id} railway=${railwayServiceId} (aguardando deploy)`);

  // status do agent permanece 'provisioning' — railway-webhook atualiza para 'active' quando deploy subir
  return jsonResponse(200, {
    success: true,
    agent_instance_id: agent.id,
    railway_service_id: railwayServiceId,
    job_id: job.id,
    plan_slug: planSlug,
    agent_name: agentName,
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function failJob(
  // deno-lint-ignore no-explicit-any
  supabase: any,
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
  // deno-lint-ignore no-explicit-any
  supabase: any,
  agent: { id: string },
  jobId: string,
  message: string,
): Promise<boolean> {
  const { data: job } = await supabase
    .from("provisioning_jobs")
    .select("attempt, max_attempts")
    .eq("id", jobId)
    .single();

  const attempt: number = (job?.attempt as number | undefined) ?? 1;
  const max: number = (job?.max_attempts as number | undefined) ?? 5;

  if (attempt >= max) {
    await failJob(supabase, agent, jobId, `Max attempts reached. Last error: ${message}`);
    return true;
  }

  const nextDelayMs = Math.pow(attempt, 2) * 60_000;
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
  return false;
}

/**
 * Fluxo de re-provisionamento: agent_instance já tem railway_service_id.
 * Em vez de criar novo serviço (que dá erro "service already exists"),
 * faz upsert das variáveis de ambiente com defaults automáticos e dispara redeploy.
 */
async function handleUpdateExistingService(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  agent: any,
  body: RequestBody,
): Promise<Response> {
  const railwayServiceId: string = agent.railway_service_id;

  // Carregar profile + plano para gerar defaults coerentes
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", agent.user_id)
    .maybeSingle();

  const fullName = (profile?.full_name?.trim() || "Usuário").toString();
  const firstName = fullName.split(" ")[0] || "Usuário";
  const agentName =
    body.agent_name?.trim() ||
    (agent.agent_name?.trim() ?? "") ||
    `Mika de ${firstName}`;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id, status, plans(slug)")
    .eq("user_id", agent.user_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // deno-lint-ignore no-explicit-any
  const planSlug = ((subscription as any)?.plans?.slug as string | undefined) ?? "basic";
  const isPro = ["professional", "enterprise"].includes(planSlug);

  const defaultSoul = `Você se chama ${agentName}. Você é um assistente pessoal de IA criado pela DOMCO para ${fullName}. Você é proativo, direto e fala sempre em português brasileiro. Você ajuda ${firstName} a ser mais produtivo — gerenciando emails, agenda, tarefas e automatizando o que puder. Seja conciso nas respostas via Telegram. Nunca se identifique como Hermes ou como produto da Nous Research — você é Mika.`;
  const soulContent = body.soul_content?.trim() || defaultSoul;

  const defaultModel = isPro
    ? "openrouter/google/gemma-4-31b-it"
    : "openrouter/google/gemma-4-27b-a4b-it";
  const model = body.model || defaultModel;
  const sttProvider = body.stt_provider || "local";
  const ttsProvider = body.tts_provider || "disabled";

  console.log(`[provision-agent:update] agent=${agent.id} service=${railwayServiceId} plano=${planSlug}`);

  // Resolver project/environment Railway
  let projectId: string | null = null;
  let environmentId: string | null = null;

  if (agent.vps_pool_id) {
    const { data: pool } = await supabase
      .from("vps_pool")
      .select("railway_project_id, railway_environment_id")
      .eq("id", agent.vps_pool_id)
      .maybeSingle();
    projectId = pool?.railway_project_id ?? null;
    environmentId = pool?.railway_environment_id ?? null;
  }

  if (!projectId || !environmentId) {
    const ctx = await getServiceContext({ token: RAILWAY_API_TOKEN!, serviceId: railwayServiceId });
    projectId = projectId ?? ctx.projectId;
    environmentId = environmentId ?? ctx.environmentId;
  }

  if (!projectId || !environmentId) {
    console.error(`[provision-agent:update] não foi possível resolver railway project/environment`);
    return jsonResponse(500, { error: "failed to resolve railway project/environment" });
  }

  // Upsert das vars principais (não mexemos em token Telegram aqui — preservado)
  const variables: Record<string, string> = {
    HERMES_SOUL_OVERRIDE: soulContent,
    HERMES_MODEL: model,
    HERMES_FALLBACK_MODEL: "openrouter/google/gemma-4-31b-it",
    HERMES_STT_PROVIDER: sttProvider,
    HERMES_TTS_PROVIDER: ttsProvider,
  };

  // Re-aplica TELEGRAM_ALLOWED_USERS / HOME_CHANNEL se já capturamos chat_id do dono
  // (importante para corrigir agentes que foram provisionados sem chat_id e tinham
  // que pedir pairing manual).
  if (agent.telegram_user_chat_id) {
    const chatIdStr = String(agent.telegram_user_chat_id);
    variables.TELEGRAM_ALLOWED_USERS = chatIdStr;
    variables.TELEGRAM_HOME_CHANNEL = chatIdStr;
  }

  try {
    await upsertRailwayVariableCollection({
      token: RAILWAY_API_TOKEN!,
      serviceId: railwayServiceId,
      environmentId,
      projectId,
      variables,
      skipDeploys: true,
    });
    console.log(`[provision-agent:update] variáveis atualizadas (${Object.keys(variables).length})`);

    await deployRailwayService({
      token: RAILWAY_API_TOKEN!,
      serviceId: railwayServiceId,
      environmentId,
    });
    console.log(`[provision-agent:update] redeploy disparado`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[provision-agent:update] falha:`, msg);
    return jsonResponse(500, { error: "railway update failed", detail: msg });
  }

  await supabase
    .from("agent_instances")
    .update({
      model_config: {
        provider: model,
        stt: sttProvider,
        tts: ttsProvider,
        agent_name: agentName,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", agent.id);

  return jsonResponse(200, {
    success: true,
    mode: "update",
    agent_instance_id: agent.id,
    railway_service_id: railwayServiceId,
    plan_slug: planSlug,
    agent_name: agentName,
  });
}
