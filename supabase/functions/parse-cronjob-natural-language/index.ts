// Parser de descrições de cronjobs em linguagem natural.
// Usa Lovable AI Gateway (gemini-2.5-flash) para extrair cron + ação + MCPs,
// valida com cron-parser, gera human_readable em pt-BR via cronstrue.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import cronParser from "https://esm.sh/cron-parser@4.9.0";
import cronstrue from "https://esm.sh/cronstrue@2.50.0/i18n";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "google/gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_MCP_SLUGS = new Set([
  "google_workspace",
  "notion",
  "todoist",
  "calcom",
  "microsoft_365",
]);

function buildSystemPrompt(tz: string): string {
  return `Você é um parser de descrições de cronjobs em português para o assistente Mika. Receba uma descrição em linguagem natural e retorne APENAS JSON válido, sem markdown, sem explicações.

Regras:
- Timezone: ${tz}
- 'dia útil' = segunda a sexta (1-5)
- 'manhã' = 09:00, 'tarde' = 14:00, 'noite' = 19:00 (só se não especificado horário)
- 'primeiro dia do mês' = dia 1
- 'último dia do mês' = dia 28 (com warning sobre aproximação)
- Detecte MCPs mencionados (Gmail, Calendar, Drive, Notion, Todoist, Cal.com, Outlook, OneDrive) e mapeie para slugs: gmail→google_workspace, calendar→google_workspace, drive→google_workspace, notion→notion, todoist→todoist, cal.com→calcom, outlook→microsoft_365, onedrive→microsoft_365
- Confidence: 'high' se claro, 'medium' se fez suposições razoáveis, 'low' se vago

Formato (APENAS este JSON):
{"cron_expression": "0 9 * * 1", "human_readable": "(gerado pelo sistema, não preencha)", "action_description": "enviar resumo da semana", "required_mcp_slugs": ["google_workspace"], "warnings": ["Interpretei 'manhã' como 09:00"], "confidence": "high"}`;
}

interface ParsedJob {
  cron_expression: string;
  action_description: string;
  required_mcp_slugs: string[];
  warnings: string[];
  confidence: "high" | "medium" | "low";
}

function tryParseJson(text: string): ParsedJob | null {
  // 1) direto
  try {
    return JSON.parse(text) as ParsedJob;
  } catch (_) { /* segue */ }
  // 2) extrai bloco { ... }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as ParsedJob;
    } catch (_) { /* falhou */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

  let body: { natural_language_input?: string; user_timezone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const input = (body.natural_language_input ?? "").trim();
  const tz = (body.user_timezone ?? "America/Sao_Paulo").trim() || "America/Sao_Paulo";

  if (input.length < 5) {
    return json({ error: "Descrição muito curta. Tente algo mais detalhado." }, 400);
  }
  if (input.length > 1000) {
    return json({ error: "Descrição muito longa (máx 1000 caracteres)." }, 400);
  }

  // Chama Lovable AI Gateway
  let aiRes: Response;
  try {
    aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [
          { role: "system", content: buildSystemPrompt(tz) },
          { role: "user", content: input },
        ],
      }),
    });
  } catch (e) {
    console.error("AI fetch error", e instanceof Error ? e.message : "unknown");
    return json({ error: "Falha ao contatar IA. Tente novamente." }, 502);
  }

  if (aiRes.status === 429) {
    return json({ error: "Muitas requisições. Aguarde 1 minuto." }, 429);
  }
  if (aiRes.status === 402) {
    return json({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }, 402);
  }
  if (!aiRes.ok) {
    console.error("AI gateway error status", aiRes.status);
    return json({ error: "Falha ao processar com IA." }, 502);
  }

  const aiData = await aiRes.json();
  const content: string = aiData?.choices?.[0]?.message?.content ?? "";

  const parsed = tryParseJson(content);
  if (!parsed) {
    return json(
      { error: "Não conseguimos entender a descrição. Tente reescrever de forma mais clara." },
      422,
    );
  }

  // Sanitiza required_mcp_slugs
  const reqSlugs = Array.isArray(parsed.required_mcp_slugs)
    ? parsed.required_mcp_slugs.filter((s): s is string => typeof s === "string" && VALID_MCP_SLUGS.has(s))
    : [];

  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const confidence: "high" | "medium" | "low" =
    parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
      ? parsed.confidence
      : "medium";

  const cron = (parsed.cron_expression ?? "").trim();
  if (!cron) {
    return json({ error: "IA não retornou expressão cron. Tente reescrever." }, 422);
  }

  // Valida cron e calcula next_run_at
  let nextRunAt: string | null = null;
  try {
    const interval = cronParser.parseExpression(cron, { tz });
    nextRunAt = interval.next().toDate().toISOString();
  } catch (e) {
    return json(
      { error: `Expressão cron inválida: ${e instanceof Error ? e.message : "erro"}` },
      422,
    );
  }

  // Gera human_readable em pt-BR
  let humanReadable = "";
  try {
    humanReadable = cronstrue.toString(cron, { locale: "pt_BR" });
  } catch (_) {
    humanReadable = cron; // fallback
  }

  const action = (parsed.action_description ?? "").trim();

  return json({
    cron_expression: cron,
    human_readable: humanReadable,
    action_description: action,
    required_mcp_slugs: reqSlugs,
    warnings,
    confidence,
    next_run_at: nextRunAt,
  });
});
