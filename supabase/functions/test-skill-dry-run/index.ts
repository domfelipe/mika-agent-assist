// Executa um dry-run de uma skill: simula a execução via LLM, sem acionar ferramentas reais.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Você é o agente Mika executando uma skill em modo de teste (dry-run). Você NÃO deve executar ferramentas reais — apenas simular. Receba a definição da skill e o input do usuário. Descreva passo a passo o que você faria, qual ferramenta acionaria em cada momento, e qual seria o output final. Seja claro e didático. Se a skill estiver mal definida ou ambígua para o input dado, explique o problema.`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

class DryRunError extends Error {
  status: number;
  clientMessage: string;

  constructor(status: number, clientMessage: string, logMessage = clientMessage) {
    super(logMessage);
    this.status = status;
    this.clientMessage = clientMessage;
  }
}

async function generateDryRunOutput(markdownContent: string, testInput: string): Promise<string> {
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Definição da skill:\n\`\`\`\n${markdownContent}\n\`\`\`\n\nInput do usuário: ${testInput}`,
        },
      ],
    }),
  });

  if (aiRes.status === 429) {
    throw new DryRunError(
      429,
      "Muitas requisições. Aguarde 1 minuto e tente novamente.",
      "Muitas requisições. Aguarde 1 minuto.",
    );
  }

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    throw new DryRunError(
      500,
      "Falha ao executar teste.",
      `AI error ${aiRes.status}: ${txt.slice(0, 200)}`,
    );
  }

  const data = await aiRes.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: extrai user do JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: { skill_version_id?: string; markdown_content?: string; test_input?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const skillVersionId =
    typeof body.skill_version_id === "string" ? body.skill_version_id.trim() : "";
  const markdownContent =
    typeof body.markdown_content === "string" ? body.markdown_content.trim() : "";
  const testInput = typeof body.test_input === "string" ? body.test_input.trim() : "";

  if (testInput.length === 0) {
    return new Response(JSON.stringify({ error: "test_input é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!skillVersionId && !markdownContent) {
    return new Response(
      JSON.stringify({ error: "skill_version_id ou markdown_content é obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (markdownContent.length > 50000) {
    return new Response(JSON.stringify({ error: "markdown_content excede 50000 caracteres" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (markdownContent) {
    const startedAt = Date.now();
    try {
      const test_output = await generateDryRunOutput(markdownContent, testInput);
      return new Response(
        JSON.stringify({ test_output, duration_ms: Date.now() - startedAt, status: "success" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (e) {
      const msg = e instanceof DryRunError ? e.clientMessage : "Erro ao executar teste.";
      const status = e instanceof DryRunError ? e.status : 500;
      console.error("Stateless skill dry-run failed:", e instanceof Error ? e.message : String(e));
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Verifica ownership: skill_version -> skill -> user_id
  const { data: versionRow, error: vErr } = await admin
    .from("skill_versions")
    .select("id, markdown_content, skills!inner(user_id)")
    .eq("id", skillVersionId)
    .maybeSingle();

  if (vErr || !versionRow) {
    return new Response(JSON.stringify({ error: "Versão não encontrada" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // @ts-expect-error supabase nested type
  if (versionRow.skills.user_id !== userId) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cria registro running
  const { data: runRow, error: runErr } = await admin
    .from("skill_test_runs")
    .insert({
      skill_version_id: skillVersionId,
      user_id: userId,
      test_input: testInput,
      status: "running",
      test_type: "dry_run",
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    console.error("Failed to create test run:", runErr);
    return new Response(JSON.stringify({ error: "Falha ao registrar teste" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const runId = runRow.id;
  const startedAt = Date.now();

  try {
    const test_output = await generateDryRunOutput(versionRow.markdown_content, testInput);
    const duration = Date.now() - startedAt;

    await admin
      .from("skill_test_runs")
      .update({ status: "success", test_output, duration_ms: duration })
      .eq("id", runId);

    return new Response(JSON.stringify({ test_output, duration_ms: duration, status: "success" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    await admin
      .from("skill_test_runs")
      .update({ status: "error", error_message: msg, duration_ms: duration })
      .eq("id", runId);
    return new Response(
      JSON.stringify({
        error: e instanceof DryRunError ? e.clientMessage : "Erro ao executar teste.",
      }),
      {
        status: e instanceof DryRunError ? e.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
