// Executa um dry-run de uma skill: simula a execução via LLM, sem acionar ferramentas reais.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Você é o agente Mika executando uma skill em modo de teste (dry-run). Você NÃO deve executar ferramentas reais — apenas simular. Receba a definição da skill e o input do usuário. Descreva passo a passo o que você faria, qual ferramenta acionaria em cada momento, e qual seria o output final. Seja claro e didático. Se a skill estiver mal definida ou ambígua para o input dado, explique o problema.`;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  let body: { skill_version_id?: string; test_input?: string };
  try {
    body = await req.json();
  let body: { skill_version_id?: string; test_input?: string; markdown_content?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { skill_version_id, test_input, markdown_content } = body;
  if (!test_input || test_input.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "test_input é obrigatório" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Stateless mode: markdown_content direto (preview de nova skill, sem persistência)
  const isStateless =
    !!markdown_content &&
    markdown_content.trim().length > 0 &&
    (!skill_version_id || skill_version_id === "preview");

  let resolvedMarkdown: string | null = null;
  let persistedVersionId: string | null = null;

  if (isStateless) {
    if (markdown_content!.length > 50000) {
      return new Response(JSON.stringify({ error: "markdown_content excede 50.000 caracteres" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    resolvedMarkdown = markdown_content!;
  } else {
    if (!skill_version_id) {
      return new Response(
        JSON.stringify({ error: "skill_version_id ou markdown_content é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Verifica ownership: skill_version -> skill -> user_id
    const { data: versionRow, error: vErr } = await admin
      .from("skill_versions")
      .select("id, markdown_content, skills!inner(user_id)")
      .eq("id", skill_version_id)
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
    resolvedMarkdown = versionRow.markdown_content as string;
    persistedVersionId = skill_version_id;
  }

    });
  }

  const runId = runRow.id;
  const startedAt = Date.now();

  try {
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
            content: `Definição da skill:\n\`\`\`\n${versionRow.markdown_content}\n\`\`\`\n\nInput do usuário: ${test_input}`,
          },
        ],
      }),
    });

    if (aiRes.status === 429) {
      const duration = Date.now() - startedAt;
      await admin
        .from("skill_test_runs")
        .update({
          status: "error",
          error_message: "Muitas requisições. Aguarde 1 minuto.",
          duration_ms: duration,
        })
        .eq("id", runId);
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Aguarde 1 minuto e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      const duration = Date.now() - startedAt;
      await admin
        .from("skill_test_runs")
        .update({
          status: "error",
          error_message: `AI error ${aiRes.status}: ${txt.slice(0, 200)}`,
          duration_ms: duration,
        })
        .eq("id", runId);
      return new Response(JSON.stringify({ error: "Falha ao executar teste." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const test_output: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    const duration = Date.now() - startedAt;

    await admin
      .from("skill_test_runs")
      .update({ status: "success", test_output, duration_ms: duration })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ test_output, duration_ms: duration, status: "success" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const duration = Date.now() - startedAt;
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    await admin
      .from("skill_test_runs")
      .update({ status: "error", error_message: msg, duration_ms: duration })
      .eq("id", runId);
    return new Response(JSON.stringify({ error: "Erro ao executar teste." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
