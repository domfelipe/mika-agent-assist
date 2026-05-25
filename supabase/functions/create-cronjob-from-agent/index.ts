// create-cronjob-from-agent
// Endpoint chamado pelo runtime Mika (Hermes container no Railway) quando o
// usuário pede para criar um cronjob via chat no Telegram.
//
// Fluxo:
//  1) Autentica via X-Internal-Secret (INTERNAL_FUNCTION_SECRET)
//  2) Recebe: agent_instance_id + natural_language_input (e opcionalmente
//     campos já parseados: cron_expression, action_prompt, required_mcp_slugs)
//  3) Se não veio pré-parseado, chama Lovable AI Gateway (gemini-2.5-flash)
//     para extrair cron + ação + MCPs (mesmo parser do wizard)
//  4) Valida cron com cron-parser, gera human_readable em pt-BR via cronstrue
//  5) Resolve user_id a partir do agent_instance_id
//  6) Insere em scheduled_jobs (service role; triggers de limite ainda valem)
//  7) Dispara sync-agent-runtime para empurrar o job ao runtime do agente
//  8) Retorna { success, job_id, name, human_readable, next_run_at }
//
// Esse endpoint substitui o uso da tool nativa `cron.create` do Hermes, que
// não entrega via Telegram nem aparece em scheduled_jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import cronParser from "https://esm.sh/cron-parser@4.9.0";
import cronstrue from "https://esm.sh/cronstrue@2.50.0/i18n";
import { corsHeaders } from "../_shared/cors.ts";
import { syncAgentRuntimeSnapshot } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";

const MODEL = "google/gemini-2.5-flash";

const VALID_MCP_SLUGS = new Set([
  "google_workspace",
  "notion",
  "todoist",
  "calcom",
  "microsoft_365",
]);

interface RequestBody {
  agent_instance_id: string;
  natural_language_input: string;
  // Opcionais — se Mika já parseou no lado dele, evita 2ª chamada à IA
  cron_expression?: string;
  action_prompt?: string;
  required_mcp_slugs?: string[];
  name?: string;
  description?: string | null;
  timezone?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function buildSystemPrompt(tz: string): string {
  return `Você é um parser de descrições de cronjobs em português para o assistente Mika. Receba uma descrição em linguagem natural e retorne APENAS JSON válido, sem markdown, sem explicações.

Regras:
- Timezone: ${tz}
- 'dia útil' = segunda a sexta (1-5)
- 'manhã' = 09:00, 'tarde' = 14:00, 'noite' = 19:00 (só se não especificado horário)
- 'primeiro dia do mês' = dia 1
- 'último dia do mês' = dia 28
- MCPs: gmail/calendar/drive→google_workspace, notion→notion, todoist→todoist, cal.com→calcom, outlook/onedrive→microsoft_365

Formato (APENAS este JSON):
{"cron_expression": "0 9 * * 1", "action_description": "enviar resumo da semana", "required_mcp_slugs": ["google_workspace"]}`;
}

interface ParsedJob {
  cron_expression: string;
  action_description: string;
  required_mcp_slugs: string[];
}

function tryParseJson(text: string): ParsedJob | null {
  try {
    return JSON.parse(text) as ParsedJob;
  } catch (_) { /* segue */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as ParsedJob;
    } catch (_) { /* falhou */ }
  }
  return null;
}

async function parseWithAI(input: string, tz: string): Promise<ParsedJob | null> {
  if (!LOVABLE_API_KEY) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [
        { role: "system", content: buildSystemPrompt(tz) },
        { role: "user", content: input },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return tryParseJson(content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 1) Auth: apenas X-Internal-Secret (chamada server-to-server do runtime)
  const received = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_FUNCTION_SECRET || !received || !constantTimeEq(INTERNAL_FUNCTION_SECRET, received)) {
    return json({ error: "unauthorized" }, 401);
  }

  // 2) Body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  if (!body.agent_instance_id) return json({ error: "agent_instance_id required" }, 400);
  const input = (body.natural_language_input ?? "").trim();
  if (input.length < 5) return json({ error: "natural_language_input too short" }, 400);
  if (input.length > 1000) return json({ error: "natural_language_input too long (max 1000)" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) Resolve user_id + timezone via agent_instance
  const { data: agent, error: agentErr } = await admin
    .from("agent_instances")
    .select("id, user_id, agent_name")
    .eq("id", body.agent_instance_id)
    .maybeSingle();
  if (agentErr || !agent) return json({ error: "agent_instance not found" }, 404);

  let tz = (body.timezone ?? "").trim();
  if (!tz) {
    const { data: profile } = await admin
      .from("profiles")
      .select("timezone")
      .eq("id", agent.user_id)
      .maybeSingle();
    tz = (profile?.timezone ?? "America/Sao_Paulo").trim() || "America/Sao_Paulo";
  }

  // 4) Parse (pré-parseado ou via IA)
  let cron = (body.cron_expression ?? "").trim();
  let actionPrompt = (body.action_prompt ?? "").trim();
  let reqSlugs = Array.isArray(body.required_mcp_slugs)
    ? body.required_mcp_slugs.filter((s): s is string => typeof s === "string" && VALID_MCP_SLUGS.has(s))
    : [];

  if (!cron || !actionPrompt) {
    const parsed = await parseWithAI(input, tz);
    if (!parsed) {
      return json({ error: "failed to parse natural language input" }, 422);
    }
    cron = cron || (parsed.cron_expression ?? "").trim();
    actionPrompt = actionPrompt || (parsed.action_description ?? "").trim();
    if (reqSlugs.length === 0 && Array.isArray(parsed.required_mcp_slugs)) {
      reqSlugs = parsed.required_mcp_slugs.filter(
        (s): s is string => typeof s === "string" && VALID_MCP_SLUGS.has(s),
      );
    }
  }

  if (!cron) return json({ error: "cron_expression missing" }, 422);
  if (!actionPrompt) return json({ error: "action_prompt missing" }, 422);

  // 5) Valida cron + next_run_at
  let nextRunAt: string | null = null;
  try {
    const interval = cronParser.parseExpression(cron, { tz });
    nextRunAt = interval.next().toDate().toISOString();
  } catch (e) {
    return json(
      { error: `invalid cron expression: ${e instanceof Error ? e.message : "error"}` },
      422,
    );
  }

  // 6) human_readable em pt-BR
  let humanReadable = cron;
  try {
    humanReadable = cronstrue.toString(cron, { locale: "pt_BR" });
  } catch (_) { /* fallback */ }

  // 7) Nome: usa o fornecido ou deriva do input
  const name = (body.name ?? "").trim() || input.slice(0, 80);
  const description = body.description ?? null;

  // 8) Insert (RLS bypass via service role; trigger enforce_job_limit ainda valida)
  const { data: inserted, error: insertErr } = await admin
    .from("scheduled_jobs")
    .insert({
      user_id: agent.user_id,
      agent_instance_id: agent.id,
      name,
      description,
      natural_language_input: input,
      cron_expression: cron,
      human_readable: humanReadable,
      action_prompt: actionPrompt,
      required_mcp_slugs: reqSlugs,
      timezone: tz,
      next_run_at: nextRunAt,
      status: "active",
    })
    .select("*")
    .single();

  if (insertErr) {
    const code = (insertErr as { code?: string }).code ?? "";
    // Erros do trigger enforce_job_limit
    if (code === "P0001") return json({ error: "no active subscription" }, 402);
    if (code === "P0002") return json({ error: "job limit reached for plan" }, 403);
    if (code === "P0004") return json({ error: "plan does not allow automations" }, 403);
    if (code === "P0005") return json({ error: "agent is not active" }, 409);
    console.error("insert scheduled_jobs failed:", insertErr);
    return json({ error: "failed to create cronjob", detail: insertErr.message }, 500);
  }

  // 9) Push para o runtime (best-effort; não derruba a criação se falhar)
  let syncOk = false;
  let syncError: string | null = null;
  try {
    await syncAgentRuntimeSnapshot({
      supabase: admin,
      agentInstanceId: agent.id,
      railwayToken: RAILWAY_API_TOKEN,
      apiKey: HERMES_API_SERVER_KEY,
      scope: "cronjobs",
    });
    syncOk = true;
  } catch (e) {
    syncError = e instanceof Error ? e.message : String(e);
    console.error("runtime sync failed (job created anyway):", syncError);
  }

  return json({
    success: true,
    job_id: inserted.id,
    name: inserted.name,
    cron_expression: inserted.cron_expression,
    human_readable: inserted.human_readable,
    next_run_at: inserted.next_run_at,
    required_mcp_slugs: inserted.required_mcp_slugs,
    runtime_sync_ok: syncOk,
    runtime_sync_error: syncError,
  });
});
