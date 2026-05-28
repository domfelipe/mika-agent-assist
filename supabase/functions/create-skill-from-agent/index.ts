// create-skill-from-agent
// Endpoint server-to-server chamado pelo runtime Mika/Hermes quando o usuario
// pede pelo Telegram para criar uma nova skill.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { syncAgentSkillsSnapshot } from "../_shared/runtime-sync.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const RAILWAY_API_TOKEN = Deno.env.get("RAILWAY_API_TOKEN") ?? "";
const HERMES_API_SERVER_KEY = Deno.env.get("HERMES_API_SERVER_KEY") ?? "";
const MODEL = "google/gemini-2.5-flash";
const CONTRACT_VERSION = "2026-05-28";
const MAX_MARKDOWN_LEN = 50000;

interface RequestBody {
  agent_instance_id: string;
  natural_language_input: string;
  name?: string;
  description?: string;
  trigger_keywords?: string;
  markdown_content?: string;
}

interface GeneratedSkill {
  name: string;
  description: string;
  trigger_keywords: string;
  markdown_content: string;
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

function isAuthorized(req: Request): boolean {
  const received = req.headers.get("x-internal-secret") ?? "";
  return (
    !!INTERNAL_FUNCTION_SECRET && !!received && constantTimeEq(INTERNAL_FUNCTION_SECRET, received)
  );
}

function normalizeText(value: unknown, fallback: string, max = 200): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, max);
}

function extractFrontmatterField(markdown: string, field: string): string | null {
  const match = markdown.match(new RegExp(`^${field}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") || null;
}

function ensureSkillFrontmatter(skill: GeneratedSkill): string {
  const markdown = skill.markdown_content
    .trim()
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const body = markdown.replace(/^---\s*[\s\S]*?\n---\s*/i, "").trim();

  return `---
name: ${skill.name}
description: ${skill.description}
trigger_keywords: ${skill.trigger_keywords}
---

${body}`.slice(0, MAX_MARKDOWN_LEN);
}

function tryParseJson(text: string): GeneratedSkill | null {
  try {
    return JSON.parse(text) as GeneratedSkill;
  } catch (_) {
    // segue
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as GeneratedSkill;
  } catch (_) {
    return null;
  }
}

async function generateSkillFromInput(input: string): Promise<GeneratedSkill | null> {
  if (!LOVABLE_API_KEY) return null;

  const systemPrompt = `Voce cria skills para o Hermes Agent no padrao agentskills.io.
Retorne APENAS JSON valido, sem markdown fence e sem comentarios.
Formato:
{"name":"Nome curto","description":"Descricao curta","trigger_keywords":"palavra, sinonimo, frase","markdown_content":"---\\nname: ...\\ndescription: ...\\ntrigger_keywords: ...\\n---\\n\\n## Quando usar\\n...\\n\\n## Inputs esperados\\n...\\n\\n## Passo a passo\\n1. ...\\n\\n## Ferramentas necessarias\\n...\\n\\n## Criterio de sucesso\\n..."}
Use portugues brasileiro, comandos claros, e nao prometa executar ferramentas que nao foram citadas ou conectadas.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ],
    }),
  });

  if (!res.ok) {
    console.error("create-skill-from-agent AI gateway status:", res.status);
    return null;
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return tryParseJson(content);
}

function buildFormInputs(skill: GeneratedSkill, originalInput: string): Record<string, unknown> {
  return {
    name: skill.name,
    description: skill.description,
    trigger_keywords: skill.trigger_keywords,
    expected_inputs: originalInput,
    steps: "Criada via Hermes a partir de instrucao em linguagem natural.",
    required_tools: [],
    success_criteria: "A skill possui gatilhos claros, passos executaveis e criterio de sucesso.",
    example_use_case: originalInput,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!isAuthorized(req)) {
    return json({ error: "unauthorized" }, 401);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return json({
      success: true,
      endpoint: "create-skill-from-agent",
      contract_version: CONTRACT_VERSION,
      expected_header: "X-Internal-Secret",
      required_body_fields: ["agent_instance_id", "natural_language_input"],
      optional_body_fields: ["name", "description", "trigger_keywords", "markdown_content"],
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  if (!body.agent_instance_id) return json({ error: "agent_instance_id required" }, 400);
  const input = (body.natural_language_input ?? "").trim();
  if (input.length < 10) return json({ error: "natural_language_input too short" }, 400);
  if (input.length > 3000)
    return json({ error: "natural_language_input too long (max 3000)" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: agent, error: agentErr } = await admin
    .from("agent_instances")
    .select("id, user_id")
    .eq("id", body.agent_instance_id)
    .maybeSingle();

  if (agentErr || !agent) return json({ error: "agent_instance not found" }, 404);

  let generated: GeneratedSkill | null = null;
  if (body.markdown_content?.trim()) {
    const markdown = body.markdown_content.trim();
    generated = {
      name: normalizeText(
        body.name ?? extractFrontmatterField(markdown, "name"),
        "Skill criada pelo Hermes",
        80,
      ),
      description: normalizeText(
        body.description ?? extractFrontmatterField(markdown, "description"),
        "Skill criada via Hermes.",
        240,
      ),
      trigger_keywords: normalizeText(
        body.trigger_keywords ?? extractFrontmatterField(markdown, "trigger_keywords"),
        input.slice(0, 120),
        240,
      ),
      markdown_content: markdown,
    };
  } else {
    generated = await generateSkillFromInput(input);
  }

  if (!generated?.markdown_content?.trim()) {
    return json({ error: "failed to generate skill content" }, 422);
  }

  const skillName = normalizeText(body.name ?? generated.name, "Skill criada pelo Hermes", 80);
  const skillDescription = normalizeText(
    body.description ?? generated.description,
    "Skill criada via Hermes.",
    240,
  );
  const skillTriggerKeywords = normalizeText(
    body.trigger_keywords ?? generated.trigger_keywords,
    input.slice(0, 120),
    240,
  );
  const skill: GeneratedSkill = {
    name: skillName,
    description: skillDescription,
    trigger_keywords: skillTriggerKeywords,
    markdown_content: ensureSkillFrontmatter({
      name: skillName,
      description: skillDescription,
      trigger_keywords: skillTriggerKeywords,
      markdown_content: generated.markdown_content,
    }),
  };

  const { data: insertedSkill, error: skillErr } = await admin
    .from("skills")
    .insert({
      user_id: agent.user_id,
      agent_instance_id: agent.id,
      name: skill.name,
      description: skill.description,
      trigger_keywords: skill.trigger_keywords,
      status: "draft",
    })
    .select("id")
    .single();

  if (skillErr || !insertedSkill) {
    const code = (skillErr as { code?: string } | null)?.code ?? "";
    if (code === "P0001") return json({ error: "no active subscription" }, 402);
    if (code === "P0002") return json({ error: "skill limit reached for plan" }, 403);
    if (code === "23505") return json({ error: "skill name already exists" }, 409);
    console.error("create-skill-from-agent insert skill failed:", skillErr);
    return json({ error: "failed to create skill", detail: skillErr?.message }, 500);
  }

  const { data: version, error: versionErr } = await admin
    .from("skill_versions")
    .insert({
      skill_id: insertedSkill.id,
      version_number: 1,
      markdown_content: skill.markdown_content,
      form_inputs: buildFormInputs(skill, input),
      is_live: true,
      created_by: agent.user_id,
    })
    .select("id")
    .single();

  if (versionErr || !version) {
    await admin.from("skills").update({ status: "archived" }).eq("id", insertedSkill.id);
    console.error("create-skill-from-agent insert version failed:", versionErr);
    return json({ error: "failed to create skill version", detail: versionErr?.message }, 500);
  }

  const { error: publishErr } = await admin
    .from("skills")
    .update({
      current_version_id: version.id,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", insertedSkill.id);

  if (publishErr) {
    console.error("create-skill-from-agent publish failed:", publishErr);
    return json({ error: "failed to publish skill", detail: publishErr.message }, 500);
  }

  try {
    const syncResult = await syncAgentSkillsSnapshot({
      supabase: admin,
      agentInstanceId: agent.id,
      railwayToken: RAILWAY_API_TOKEN,
      apiKey: HERMES_API_SERVER_KEY,
    });

    return json({
      success: true,
      skill_id: insertedSkill.id,
      skill_version_id: version.id,
      name: skill.name,
      description: skill.description,
      trigger_keywords: skill.trigger_keywords,
      status: "active",
      runtime_sync_ok: true,
      synced_count: syncResult.synced_count,
    });
  } catch (e) {
    const syncError = e instanceof Error ? e.message : String(e);
    await admin.from("skills").update({ status: "testing" }).eq("id", insertedSkill.id);
    console.error("create-skill-from-agent skills sync failed:", syncError);
    return json(
      {
        success: false,
        skill_id: insertedSkill.id,
        skill_version_id: version.id,
        name: skill.name,
        status: "testing",
        runtime_sync_ok: false,
        runtime_sync_error: syncError,
      },
      502,
    );
  }
});
