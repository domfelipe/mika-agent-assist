// Gera o markdown de uma skill no padrão agentskills.io via Lovable AI Gateway.
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const MAX_LEN = 50000;

const SYSTEM_PROMPT = `Você é um especialista em criar skills para o Hermes Agent no padrão agentskills.io. Gere um arquivo markdown completo e bem estruturado para a skill descrita pelo usuário. O arquivo deve seguir esta estrutura exata: cabeçalho YAML com name, description, trigger_keywords; seção ## Quando usar; seção ## Inputs esperados (se houver); seção ## Passo a passo numerada; seção ## Ferramentas necessárias; seção ## Critério de sucesso; seção opcional ## Exemplo. Use linguagem clara, imperativa e em português. Não adicione comentários fora do markdown. Retorne APENAS o conteúdo do arquivo .md, sem code fences.`;

interface FormInputs {
  name: string;
  description: string;
  trigger_keywords: string;
  expected_inputs?: string | null;
  steps: string;
  required_tools: string[];
  success_criteria: string;
  example_use_case?: string | null;
}

function formatUserMessage(f: FormInputs): string {
  return [
    `Nome: ${f.name}`,
    `Descrição: ${f.description}`,
    `Palavras-chave de gatilho: ${f.trigger_keywords}`,
    f.expected_inputs ? `Inputs esperados: ${f.expected_inputs}` : null,
    `Passo a passo:\n${f.steps}`,
    `Ferramentas necessárias: ${f.required_tools.join(", ")}`,
    `Critério de sucesso: ${f.success_criteria}`,
    f.example_use_case ? `Exemplo de uso: ${f.example_use_case}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const form_inputs = body?.form_inputs as FormInputs | undefined;

    if (!form_inputs?.name || !form_inputs?.description || !form_inputs?.steps) {
      return new Response(
        JSON.stringify({ error: "form_inputs incompleto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
          { role: "user", content: formatUserMessage(form_inputs) },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Aguarde 1 minuto e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "Crédito de IA esgotado. Entre em contato com o suporte." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, txt);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar skill. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiRes.json();
    let markdown_content: string = data?.choices?.[0]?.message?.content ?? "";
    markdown_content = markdown_content.trim();

    if (!markdown_content) {
      return new Response(
        JSON.stringify({ error: "A IA retornou conteúdo vazio. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (markdown_content.length > MAX_LEN) {
      markdown_content = markdown_content.slice(0, MAX_LEN);
    }

    return new Response(
      JSON.stringify({ markdown_content }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-skill-markdown error:", e);
    return new Response(
      JSON.stringify({ error: "Erro inesperado ao gerar skill." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
